import {
  createHash,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from "crypto";
import { promisify } from "util";
import { cookies, headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  users,
  sessions,
  systemSettings,
  notifications,
  logs,
  subscriptions,
} from "@/db/schema";
import { ssePublish } from "./sse";

const scryptAsync = promisify(scrypt);

export const APP_URL =
  process.env.APP_URL || "http://localhost:3000";
export const BOOT_TIME = Date.now();

/* --------------------------- API error type --------------------------- */
export class ApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number, message: string) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function jsonOk(data: unknown, status = 200) {
  return Response.json({ success: true, data }, { status });
}

export function jsonFail(code: string, message: string, status = 400) {
  return new Response(
    JSON.stringify({ success: false, error: { code, message } }),
    { status, headers: { "content-type": "application/json" } }
  );
}

/* ----------------------------- passwords ------------------------------ */
export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(pw, salt, 64)) as Buffer;
  return `s:${salt}:${buf.toString("hex")}`;
}

export async function verifyPassword(
  pw: string,
  stored: string
): Promise<boolean> {
  try {
    const [scheme, salt, hash] = stored.split(":");
    if (scheme !== "s" || !salt || !hash) return false;
    const buf = (await scryptAsync(pw, salt, 64)) as Buffer;
    return timingSafeEqual(buf, Buffer.from(hash, "hex"));
  } catch {
    return false;
  }
}

export const sha256 = (s: string) =>
  createHash("sha256").update(s).digest("hex");

export const newToken = (bytes = 32) => randomBytes(bytes).toString("hex");

/* ------------------------------ sessions ------------------------------ */
const SESSION_COOKIE = "wac_session";
const SESSION_DAYS = 7;

export function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_DAYS * 24 * 3600,
    secure: APP_URL.startsWith("https://"),
  };
}

export async function createSession(
  userId: string,
  ua?: string,
  ip?: string
): Promise<void> {
  const token = newToken(32);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000);
  await db
    .insert(sessions)
    .values({
      userId,
      tokenHash: sha256(token),
      userAgent: ua?.slice(0, 300),
      ip: ip?.slice(0, 64),
      expiresAt,
    });
  const c = await cookies();
  c.set(SESSION_COOKIE, token, {
    ...cookieOptions(),
    expires: expiresAt,
  });
}

export async function destroySession(token: string) {
  await db
    .delete(sessions)
    .where(eq(sessions.tokenHash, sha256(token)));
  const c = await cookies();
  c.delete(SESSION_COOKIE);
}

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  role: string;
  plan: string;
  suspended: boolean;
  emailVerified: boolean;
}

export async function getSessionUser(): Promise<
  (AuthUser & { sessionId: string }) | null
> {
  const c = await cookies();
  const token = c.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = await db
    .select({
      sessionId: sessions.id,
      userId: users.id,
      username: users.username,
      email: users.email,
      role: users.role,
      plan: users.plan,
      suspended: users.suspended,
      emailVerified: users.emailVerified,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.tokenHash, sha256(token)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.expiresAt < new Date()) {
    await db.delete(sessions).where(eq(sessions.id, row.sessionId));
    return null;
  }
  return { ...row, id: row.userId };
}

export async function requireUser(): Promise<AuthUser & { sessionId: string }> {
  const u = await getSessionUser();
  if (!u) throw new ApiError("UNAUTHORIZED", 401, "Silakan login dulu.");
  if (u.suspended)
    throw new ApiError("SUSPENDED", 403, "Akun Anda sedang ditangguhkan.");
  return u;
}

export async function requireAdmin(): Promise<AuthUser & { sessionId: string }> {
  const u = await requireUser();
  if (u.role !== "ADMIN")
    throw new ApiError("FORBIDDEN", 403, "Akses admin saja.");
  return u;
}

/* --------------------------- rate limiting ---------------------------- */
const buckets = new Map<string, { count: number; reset: number }>();

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  b.count += 1;
  return b.count <= limit;
}

/* ------------------------------ request ------------------------------- */
export async function clientIp(req: Request): Promise<string> {
  const h = await headers();
  const xf = h.get("x-forwarded-for");
  return xf?.split(",")[0]?.trim() || "127.0.0.1";
}

export async function checkOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return; // curl / non-browser API clients are allowed
  try {
    const o = new URL(origin);
    const h = await headers();
    const host = h.get("host") || "";
    const appHost = new URL(APP_URL).host;
    if (o.host !== host && o.host !== appHost) {
      throw new ApiError("ORIGIN_MISMATCH", 403, "Origin tidak dikenali.");
    }
  } catch (e) {
    if (e instanceof ApiError) throw e;
  }
}

/* ----------------------------- settings ------------------------------- */
export async function getSetting<T = any>(key: string): Promise<T | null> {
  const rows = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.key, key))
    .limit(1);
  return (rows[0]?.value as T) ?? null;
}

export async function setSetting(key: string, value: unknown) {
  const existing = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.key, key))
    .limit(1);
  if (existing.length) {
    await db
      .update(systemSettings)
      .set({ value: value as any, updatedAt: new Date() })
      .where(eq(systemSettings.key, key));
  } else {
    await db.insert(systemSettings).values({ key, value: value as any });
  }
}

export interface Plan {
  id: string;
  name: string;
  price: number;
  period: string;
  botLimit: number;
  featured?: boolean;
  cta?: string;
  features: string[];
}

export async function getPlans(): Promise<Plan[]> {
  const p = await getSetting<Plan[]>("pricing");
  return p && p.length ? p : [];
}

const BUILTIN_BOT_LIMITS: Record<string, number> = {
  free: 1,
  starter: 3,
  pro: 10,
  business: 25,
  enterprise: 999,
};

export async function planBotLimit(planName: string): Promise<number> {
  const plans = await getPlans();
  const p = plans.find((x) => x.id === planName.toLowerCase());
  if (p?.botLimit) return p.botLimit;
  // Fallback when pricing has not been seeded yet (fresh deployment race)
  return BUILTIN_BOT_LIMITS[planName.toLowerCase()] ?? 1;
}

/* ------------------------------- logging ------------------------------ */
export async function addLog(input: {
  userId?: string | null;
  botId?: string | null;
  level?: "info" | "success" | "warning" | "error" | "api";
  event: string;
  message: string;
  status?: string;
  requestId?: string;
  meta?: unknown;
}) {
  try {
    await db.insert(logs).values({
      userId: input.userId ?? null,
      botId: input.botId ?? null,
      level: input.level ?? "info",
      event: input.event,
      message: input.message.slice(0, 500),
      status: input.status,
      requestId: input.requestId,
      meta: (input.meta as any) ?? undefined,
    });
  } catch {
    /* never let logging break the app */
  }
}

/* ---------------------------- notifications --------------------------- */
export async function notify(
  userId: string,
  type: string,
  title: string,
  body: string
) {
  try {
    await db.insert(notifications).values({
      userId,
      type,
      title: title.slice(0, 120),
      body,
    });
    ssePublish("notification", { userId, type, title, body, at: Date.now() });
  } catch {
    /* noop */
  }
}

/* ------------------------------ maintenance --------------------------- */
export async function isMaintenanceActive(): Promise<boolean> {
  const m = await getSetting<{ active?: boolean }>("maintenance");
  return !!m?.active;
}

export async function subscriptionExpiring(
  userId: string
): Promise<string | null> {
  const rows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);
  const s = rows[0];
  if (!s?.expiresAt) return null;
  const diff = s.expiresAt.getTime() - Date.now();
  if (diff < 0) return "Subscription Anda telah berakhir.";
  if (diff < 3 * 24 * 3600 * 1000)
    return `Subscription Anda berakhir dalam ${Math.ceil(
      diff / (24 * 3600 * 1000)
    )} hari.`;
  return null;
}


