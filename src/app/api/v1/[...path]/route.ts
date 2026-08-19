import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  apiKeys,
  bots,
  apiRequestLog,
  logs,
  webhooks,
} from "@/db/schema";
import {
  ApiError,
  jsonFail,
  sha256,
  newToken,
  rateLimit,
  addLog,
} from "@/server/lib";
import * as engine from "@/server/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_PERMS = [
  "messages.send",
  "messages.read",
  "bots.read",
  "bots.manage",
  "webhooks.manage",
];

interface AuthedKey {
  keyId: string;
  userId: string;
  botId: string | null;
  permissions: string[];
  name: string;
  ip: string;
  requestId: string;
}

async function authKey(req: Request): Promise<AuthedKey> {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m)
    throw new ApiError(
      "MISSING_KEY",
      401,
      "Authorization header diperlukan: Bearer WATER_API_KEY"
    );
  const key = m[1].trim();
  if (!key.startsWith("WAC_"))
    throw new ApiError("INVALID_KEY", 401, "Format API key tidak valid (WAC_...)");
  const xff = req.headers.get("x-forwarded-for");
  const ip = xff?.split(",")[0]?.trim() || "127.0.0.1";
  const rows = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, sha256(key)))
    .limit(1);
  const row = rows[0];
  if (!row || row.revokedAt)
    throw new ApiError("INVALID_KEY", 401, "API key tidak valid atau sudah dicabut");
  if (row.ipWhitelist) {
    const ips = row.ipWhitelist
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (ips.length && !ips.includes(ip))
      throw new ApiError("IP_BLOCKED", 403, "IP tidak terdaftar di whitelist");
  }
  if (!rateLimit(`v1:${row.id}`, 60, 60e3))
    throw new ApiError("RATE_LIMITED", 429, "Rate limit API key terlampaui (60 req/menit)");
  const requestId = newToken(8);
  await db
    .update(apiKeys)
    .set({
      requestCount: sqlInc(),
      lastUsedAt: new Date(),
    })
    .where(eq(apiKeys.id, row.id));
  return {
    keyId: row.id,
    userId: row.userId,
    botId: row.botId,
    permissions: (row.permissions as string[]) ?? [],
    name: row.name,
    ip,
    requestId,
  };
}

// small helper to build the atomic increment
import { sql } from "drizzle-orm";
function sqlInc() {
  return sql`"request_count" + 1`;
}

function needPerm(k: AuthedKey, perm: string) {
  if (!k.permissions.includes(perm))
    throw new ApiError(
      "PERMISSION_DENIED",
      403,
      `API key tidak memiliki permission ${perm}`
    );
}

interface Ctx {
  params: Promise<{ path: string[] }>;
}

async function resolveBot(k: AuthedKey, body: any): Promise<string> {
  const wanted = body?.botId ?? k.botId;
  if (wanted) {
    const rows = await db
      .select({ id: bots.id })
      .from(bots)
      .where(and(eq(bots.id, wanted), eq(bots.userId, k.userId)))
      .limit(1);
    if (!rows.length) throw new ApiError("BOT_NOT_FOUND", 404, "Bot tidak ditemukan");
    return rows[0].id;
  }
  const first = await db
    .select({ id: bots.id })
    .from(bots)
    .where(eq(bots.userId, k.userId))
    .limit(1);
  if (!first.length) throw new ApiError("NO_BOT", 404, "Belum ada bot. Buat bot dulu.");
  return first[0].id;
}

async function logApi(k: AuthedKey, method: string, pathStr: string, status: number, botId?: string) {
  await db.insert(apiRequestLog).values({
    keyId: k.keyId,
    botId: botId ?? null,
    userId: k.userId,
    method,
    path: pathStr,
    statusCode: status,
    ip: k.ip,
  });
  await addLog({
    userId: k.userId,
    botId,
    level: status >= 500 ? "error" : "api",
    event: "api.request",
    message: `${method} ${pathStr} → ${status}`,
    status: String(status),
    requestId: k.requestId,
    meta: { key: k.name },
  });
}

function wrap(
  fn: (k: AuthedKey, body: any, segments: string[]) => Promise<Response>,
  method: string
) {
  return async (req: Request, ctx: Ctx) => {
    const { path } = await ctx.params;
    const segments = (path ?? []).map((s) => decodeURIComponent(s));
    const pathStr = "/" + segments.join("/");
    try {
      const k = await authKey(req);
      const body = method === "GET" || method === "DELETE" ? {} : (await req.json().catch(() => ({})) as any);
      const res = await fn(k, body, segments);
      await logApi(k, method, pathStr, res.status, (res as any).__botId as string | undefined);
      return res;
    } catch (e) {
      if (e instanceof ApiError) {
        await addLog({
          level: e.status >= 500 ? "error" : "api",
          event: "api.request",
          message: `${method} ${pathStr} → ${e.status} (${e.code})`,
          status: String(e.status),
          requestId: newToken(8),
        }).catch(() => {});
        return jsonFail(e.code, e.message, e.status);
      }
      console.error(`[v1:${method}]`, e);
      return jsonFail("INTERNAL", "Terjadi kesalahan pada server", 500);
    }
  };
}

/* ================================ routes =============================== */
export const v1Handlers = {
  GET: wrap(async (k, _body, seg) => {
    if (seg[0] === "bots") {
      needPerm(k, "bots.read");
      const rows = await db
        .select()
        .from(bots)
        .where(eq(bots.userId, k.userId))
        .orderBy((c: any) => c.createdAt);
      return Response.json({
        success: true,
        data: rows.map((b) => ({
          botId: b.id,
          name: b.name,
          status: b.status,
          whatsappNumber: b.whatsappNumber,
          uptimeSec: b.uptimeSec,
          messagesSent: b.messagesSent,
          messagesReceived: b.messagesReceived,
          engine: engine.isEngineRunning(b.id),
        })),
      });
    }
    if (seg[0] === "bot" && seg[1] === "status") {
      needPerm(k, "bots.read");
      const botId = k.botId ? k.botId : undefined;
      const rows = await db
        .select()
        .from(bots)
        .where(
          botId
            ? and(eq(bots.id, botId), eq(bots.userId, k.userId))
            : eq(bots.userId, k.userId)
        )
        .limit(1);
      const b = rows[0];
      if (!b) throw new ApiError("BOT_NOT_FOUND", 404, "Bot tidak ditemukan");
      const eng = await engine.engineBotDetail(b.id);
      return Response.json({
        success: true,
        data: {
          botId: b.id,
          name: b.name,
          status: b.status,
          whatsappNumber: b.whatsappNumber,
          uptimeSec: b.uptimeSec,
          startedAt: b.startedAt,
          engine: eng,
          timestamp: new Date().toISOString(),
        },
      });
    }
    throw new ApiError("NOT_FOUND", 404, "Endpoint tidak ditemukan");
  }, "GET"),

  POST: wrap(async (k, body, seg) => {
    if (seg[0] === "bots" && seg.length === 1) {
      needPerm(k, "bots.manage");
      const s = z.object({
        name: z.string().min(1).max(64),
        prefix: z.string().max(4).optional(),
        ownerNumber: z.string().max(32).optional(),
        description: z.string().max(500).optional(),
      });
      const parsed = s.safeParse(body);
      if (!parsed.success)
        throw new ApiError("VALIDATION", 400, parsed.error.issues[0].message);
      const d = parsed.data;
      const [bot] = await db
        .insert(bots)
        .values({
          userId: k.userId,
          name: d.name,
          prefix: d.prefix || "!",
          ownerNumber: d.ownerNumber?.replace(/\D/g, "") || null,
          description: d.description ?? null,
        })
        .returning();
      const { whatsappSessions } = await import("@/db/schema");
      await db.insert(whatsappSessions).values({ botId: bot.id, status: "disconnected" });
      addLog({ userId: k.userId, botId: bot.id, event: "bot.create", message: `Bot ${bot.name} dibuat via API` });
      return Response.json({ success: true, data: { botId: bot.id, name: bot.name, status: bot.status } }, { status: 201 });
    }
    if (seg[0] === "messages" && seg.length === 2) {
      needPerm(k, "messages.send");
      const type = seg[1];
      if (!["text", "image", "video", "audio", "document", "contact", "location"].includes(type))
        throw new ApiError("UNSUPPORTED_TYPE", 404, `Jenis pesan ${type} tidak didukung`);
      const base = z.object({
        botId: z.string().optional(),
        to: z.string().min(5),
      });
      const parsed = base.safeParse(body);
      if (!parsed.success) throw new ApiError("VALIDATION", 400, parsed.error.issues[0].message);
      const botId = await resolveBot(k, body);
      await engine.ensureEngineBoot();
      const payload: engine.SendPayload =
        type === "text"
          ? { to: parsed.data.to, type: "text", text: String(body.text ?? "") }
          : type === "location"
            ? {
                to: parsed.data.to,
                type: "location",
                location: body.location as { latitude: number; longitude: number; label?: string },
              }
            : type === "contact"
              ? {
                  to: parsed.data.to,
                  type: "contact",
                  contact: body.contact as { name: string; phone: string },
                }
              : {
                  to: parsed.data.to,
                  type: type as any,
                  caption: body.caption ? String(body.caption) : undefined,
                  url: body.url ? String(body.url) : undefined,
                  fileName: body.fileName ? String(body.fileName) : undefined,
                  mimetype: body.mimetype ? String(body.mimetype) : undefined,
                };
      await engine.engineSend(botId, payload);
      const res = Response.json({
        success: true,
        data: { sent: true, botId, to: parsed.data.to, type },
      });
      (res as any).__botId = botId;
      return res;
    }
    if (seg[0] === "webhooks" && seg.length === 1) {
      needPerm(k, "webhooks.manage");
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(String(body?.url ?? ""));
      } catch {
        throw new ApiError("VALIDATION", 400, "URL webhook tidak valid");
      }
      const events = Array.isArray(body?.events)
        ? (body.events as string[]).filter(Boolean)
        : [];
      if (!events.length) throw new ApiError("VALIDATION", 400, "events wajib diisi");
      const [row] = await db
        .insert(webhooks)
        .values({
          userId: k.userId,
          url: parsedUrl.toString(),
          events,
          secret: `wsec_${newToken(16)}`,
        })
        .returning();
      addLog({ userId: k.userId, event: "webhook.create", message: `Webhook dibuat via API: ${parsedUrl.toString()}` });
      return Response.json({ success: true, data: { webhookId: row.id, url: row.url, events: row.events, secret: row.secret } }, { status: 201 });
    }
    throw new ApiError("NOT_FOUND", 404, "Endpoint tidak ditemukan");
  }, "POST"),

  DELETE: wrap(async (k, _body, seg) => {
    if (seg[0] === "bots" && seg.length === 2) {
      needPerm(k, "bots.manage");
      const rows = await db
        .select({ id: bots.id, name: bots.name })
        .from(bots)
        .where(and(eq(bots.id, seg[1]), eq(bots.userId, k.userId)))
        .limit(1);
      if (!rows.length) throw new ApiError("BOT_NOT_FOUND", 404, "Bot tidak ditemukan");
      await engine.ensureEngineBoot();
      await engine.stopBot(seg[1], "deleted-via-api");
      await db.delete(bots).where(eq(bots.id, seg[1]));
      addLog({ userId: k.userId, botId: seg[1], event: "bot.delete", message: `Bot ${rows[0].name} dihapus via API` });
      const res = Response.json({ success: true, data: { deleted: seg[1] } });
      (res as any).__botId = seg[1];
      return res;
    }
    throw new ApiError("NOT_FOUND", 404, "Endpoint tidak ditemukan");
  }, "DELETE"),
};

export { ALLOWED_PERMS };

export const GET = v1Handlers.GET;
export const POST = v1Handlers.POST;
export const DELETE = v1Handlers.DELETE;
