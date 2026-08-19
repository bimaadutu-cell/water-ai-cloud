import { eq, or } from "drizzle-orm";
import { z } from "zod";
import { cookies } from "next/headers";
import { db, pool, ensureDatabaseReady } from "@/db";
import {
  users,
  subscriptions,
  passwordResets,
  emailVerifications,
} from "@/db/schema";
import {
  ApiError,
  hashPassword,
  verifyPassword,
  newToken,
  createSession,
  destroySession,
  getSessionUser,
  clientIp,
  rateLimit,
  checkOrigin,
  addLog,
  notify,
  subscriptionExpiring,
  APP_URL,
  jsonFail,
} from "@/server/lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ action: string[] }>;
}

const registerSchema = z.object({
  username: z
    .string()
    .min(3, "Username minimal 3 karakter")
    .max(32, "Username maksimal 32 karakter")
    .regex(/^[a-zA-Z0-9_]+$/, "Hanya huruf, angka, underscore"),
  email: z.string().email("Email tidak valid").max(255),
  password: z.string().min(8, "Password minimal 8 karakter").max(100),
});

const loginSchema = z.object({
  identifier: z.string().min(1, "Email/username wajib diisi"),
  password: z.string().min(1, "Password wajib diisi"),
});

const resetSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(8, "Password minimal 8 karakter").max(100),
});

const tokenSchema = z.object({ token: z.string().min(10) });

function publicUser(u: {
  id: string;
  username: string;
  email: string;
  role: string;
  plan: string;
  suspended: boolean;
  emailVerified: boolean;
  createdAt: Date;
}) {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    role: u.role,
    plan: u.plan,
    suspended: u.suspended,
    emailVerified: u.emailVerified,
    createdAt: u.createdAt,
  };
}

export async function POST(req: Request, ctx: Ctx) {
  const { action } = await ctx.params;
  const a = action?.[0] ?? "";
  try {
    await ensureDatabaseReady();

    switch (a) {
      case "register":
        return await register(req);
      case "login":
        return await login(req);
      case "logout":
        return await logout();
      case "forgot":
        return await forgot(req);
      case "reset":
        return await reset(req);
      case "verify":
        return await verify(req);
      default:
        return jsonFail("NOT_FOUND", "Endpoint tidak ditemukan", 404);
    }
  } catch (e) {
    if (e instanceof ApiError) return jsonFail(e.code, e.message, e.status);
    console.error(`[auth:${a}] CRITICAL ERROR:`, e instanceof Error ? e.stack || e.message : e);
    return jsonFail("INTERNAL", `Terjadi kesalahan pada server: ${e instanceof Error ? e.message : String(e)}`, 500);
  }
}

async function register(req: Request) {
  await checkOrigin(req);
  const ip = await clientIp(req);
  if (!rateLimit(`reg:${ip}`, 5, 3600e3))
    throw new ApiError("RATE_LIMITED", 429, "Terlalu banyak percobaan. Coba lagi nanti.");
  const body = await req.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success)
    throw new ApiError("VALIDATION", 400, parsed.error.issues[0].message);
  const { username, email, password } = parsed.data;

  // Check existing email using robust pool query
  const existingEmail = await pool.query(
    `SELECT id FROM users WHERE email = $1 LIMIT 1`,
    [email]
  );
  if (existingEmail.rows.length > 0)
    throw new ApiError("EMAIL_TAKEN", 409, "Email sudah terdaftar.");

  // Check existing username using robust pool query
  const existingUsername = await pool.query(
    `SELECT id FROM users WHERE username = $1 LIMIT 1`,
    [username]
  );
  if (existingUsername.rows.length > 0)
    throw new ApiError("USERNAME_TAKEN", 409, "Username sudah dipakai.");

  const passwordHash = await hashPassword(password);
  const insertRes = await pool.query(
    `INSERT INTO users (username, email, password_hash, role, plan, suspended, email_verified)
     VALUES ($1, $2, $3, 'USER', 'FREE', FALSE, FALSE)
     RETURNING id, username, email, role, plan, suspended, email_verified, created_at`,
    [username, email, passwordHash]
  );
  const userRow = insertRes.rows[0];
  const user = {
    id: userRow.id,
    username: userRow.username,
    email: userRow.email,
    role: userRow.role,
    plan: userRow.plan,
    suspended: userRow.suspended,
    emailVerified: userRow.email_verified,
    createdAt: userRow.created_at,
  };

  await pool.query(
    `INSERT INTO subscriptions (user_id, plan, status) VALUES ($1, 'FREE', 'active')`,
    [user.id]
  );

  const verifyToken = newToken(24);
  await pool.query(
    `INSERT INTO email_verifications (user_id, token, expires_at) VALUES ($1, $2, $3)`,
    [user.id, verifyToken, new Date(Date.now() + 24 * 3600e3)]
  );
  const verifyLink = `${APP_URL}/verify?token=${verifyToken}`;

  await createSession(user.id, req.headers.get("user-agent") ?? undefined, ip);
  await addLog({
    userId: user.id,
    level: "success",
    event: "auth.register",
    message: `Akun baru dibuat: ${username}`,
  });
  return Response.json(
    {
      success: true,
      data: { user: publicUser(user), verifyLink, email: user.email },
    },
    { status: 201 }
  );
}

async function login(req: Request) {
  await checkOrigin(req);
  const ip = await clientIp(req);
  if (!rateLimit(`login:${ip}`, 8, 15 * 60e3))
    throw new ApiError("RATE_LIMITED", 429, "Terlalu banyak percobaan login. Tunggu beberapa menit.");
  const body = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success)
    throw new ApiError("VALIDATION", 400, parsed.error.issues[0].message);
  const { identifier, password } = parsed.data;

  const rows = await pool.query(
    `SELECT id, username, email, password_hash, role, plan, suspended, email_verified, created_at
     FROM users WHERE email = $1 OR username = $1 LIMIT 1`,
    [identifier]
  );
  const userRow = rows.rows[0];
  if (!userRow)
    throw new ApiError("INVALID_CREDENTIALS", 401, "Email/username atau password salah.");

  const user = {
    id: userRow.id,
    username: userRow.username,
    email: userRow.email,
    passwordHash: userRow.password_hash,
    role: userRow.role,
    plan: userRow.plan,
    suspended: userRow.suspended,
    emailVerified: userRow.email_verified,
    createdAt: userRow.created_at,
  };

  const okPw = await verifyPassword(password, user.passwordHash);
  if (!okPw)
    throw new ApiError("INVALID_CREDENTIALS", 401, "Email/username atau password salah.");
  if (user.suspended)
    throw new ApiError("SUSPENDED", 403, "Akun ditangguhkan. Hubungi support.");

  await pool.query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [user.id]);
  await createSession(user.id, req.headers.get("user-agent") ?? undefined, ip);
  await addLog({
    userId: user.id,
    level: "info",
    event: "auth.login",
    message: `Login dari ${ip}`,
  });
  const expiring = await subscriptionExpiring(user.id);
  if (expiring)
    await notify(user.id, "subscription.expiring", "Subscription hampir berakhir", expiring);
  return Response.json({ success: true, data: { user: publicUser(user) } });
}

async function logout() {
  const c = await cookies();
  const token = c.get("wac_session")?.value;
  const user = await getSessionUser();
  if (user) {
    await addLog({
      userId: user.id,
      level: "info",
      event: "auth.logout",
      message: "Logout",
    });
    if (token) await destroySession(token);
  }
  return Response.json({ success: true, data: { ok: true } });
}

async function forgot(req: Request) {
  await checkOrigin(req);
  const ip = await clientIp(req);
  if (!rateLimit(`forgot:${ip}`, 3, 15 * 60e3))
    throw new ApiError("RATE_LIMITED", 429, "Terlalu banyak permintaan. Coba lagi nanti.");
  const body = await req.json().catch(() => null);
  const email = z.string().email().safeParse(body?.email);
  if (!email.success) throw new ApiError("VALIDATION", 400, "Email tidak valid");
  const rows = await db.select().from(users).where(eq(users.email, email.data)).limit(1);
  const user = rows[0];
  let resetLink: string | null = null;
  if (user) {
    const token = newToken(24);
    await db.insert(passwordResets).values({
      userId: user.id,
      token,
      expiresAt: new Date(Date.now() + 3600e3),
    });
    resetLink = `${APP_URL}/reset?token=${token}`;
    await addLog({
      userId: user.id,
      level: "info",
      event: "auth.password_reset_requested",
      message: "Link reset password dibuat",
    });
  }
  return Response.json({
    success: true,
    data: {
      message:
        "Jika email terdaftar, link reset tersedia di bawah (environment ini belum memiliki SMTP — di production link dikirim via email).",
      resetLink,
    },
  });
}

async function reset(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = resetSchema.safeParse(body);
  if (!parsed.success)
    throw new ApiError("VALIDATION", 400, parsed.error.issues[0].message);
  const rows = await db
    .select()
    .from(passwordResets)
    .where(eq(passwordResets.token, parsed.data.token))
    .limit(1);
  const row = rows[0];
  if (!row || row.usedAt || row.expiresAt < new Date())
    throw new ApiError("INVALID_TOKEN", 400, "Token reset tidak valid atau kedaluwarsa.");
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(parsed.data.password) })
    .where(eq(users.id, row.userId));
  await db
    .update(passwordResets)
    .set({ usedAt: new Date() })
    .where(eq(passwordResets.id, row.id));
  await addLog({
    userId: row.userId,
    level: "success",
    event: "auth.password_reset",
    message: "Password berhasil direset",
  });
  return Response.json({ success: true, data: { ok: true } });
}

async function verify(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = tokenSchema.safeParse(body);
  if (!parsed.success)
    throw new ApiError("VALIDATION", 400, "Token tidak valid");
  const rows = await db
    .select()
    .from(emailVerifications)
    .where(eq(emailVerifications.token, parsed.data.token))
    .limit(1);
  const row = rows[0];
  if (!row || row.usedAt || row.expiresAt < new Date())
    throw new ApiError("INVALID_TOKEN", 400, "Token verifikasi tidak valid atau kedaluwarsa.");
  await db
    .update(users)
    .set({ emailVerified: true })
    .where(eq(users.id, row.userId));
  await db
    .update(emailVerifications)
    .set({ usedAt: new Date() })
    .where(eq(emailVerifications.id, row.id));
  await notify(
    row.userId,
    "email.verified",
    "Email terverifikasi",
    "Alamat email Anda telah dikonfirmasi."
  );
  return Response.json({ success: true, data: { verified: true } });
}
