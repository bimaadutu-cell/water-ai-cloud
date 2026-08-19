import {
  eq,
  and,
  desc,
  gte,
  lte,
  like,
  count,
  sql,
  inArray,
  isNull,
} from "drizzle-orm";
import { db } from "@/db";
import {
  users,
  bots,
  whatsappSessions,
  messages,
  commands,
  automations,
  apiKeys,
  webhooks,
  webhookEvents,
  logs,
  subscriptions,
  payments,
  notifications,
  tickets,
  ticketMessages,
  sessions,
  announcements,
  apiRequestLog,
  botOwners,
} from "@/db/schema";
import {
  ApiError,
  checkOrigin,
  clientIp,
  isMaintenanceActive,
  requireUser,
  rateLimit,
  jsonFail,
  getPlans,
  planBotLimit,
  addLog,
  notify,
  sha256,
  newToken,
  hashPassword,
  verifyPassword,
  getSetting,
} from "@/server/lib";
import { computeSystemStatus } from "@/server/sse";
import * as engine from "@/server/engine";
import { dispatchWebhook, testWebhook } from "@/server/webhooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type User = Awaited<ReturnType<typeof requireUser>>;

const ALLOWED_PERMS = [
  "messages.send",
  "messages.read",
  "bots.read",
  "bots.manage",
  "webhooks.manage",
];
const ALLOWED_EVENTS = [
  "message.received",
  "message.sent",
  "message.failed",
  "bot.connected",
  "bot.disconnected",
  "bot.started",
  "bot.stopped",
];

import { REGISTRY } from "@/server/commands/registry";

async function guard(): Promise<User> {
  const user = await requireUser();
  if (!rateLimit(`dash:${user.id}`, 240, 60e3))
    throw new ApiError("RATE_LIMITED", 429, "Terlalu banyak request. Pelan-pelan.");
  const maint = await isMaintenanceActive();
  if (maint && user.role !== "ADMIN")
    throw new ApiError("MAINTENANCE", 503, "Platform sedang dalam mode maintenance.");
  return user;
}

async function ownedBot(user: User, botId: string) {
  const rows = await db
    .select()
    .from(bots)
    .where(and(eq(bots.id, botId), eq(bots.userId, user.id)))
    .limit(1);
  const bot = rows[0];
  if (!bot) throw new ApiError("BOT_NOT_FOUND", 404, "Bot tidak ditemukan");
  return bot;
}

interface Ctx {
  params: Promise<{ path: string[] }>;
}

async function readBody(req: Request) {
  return (await req.json().catch(() => null)) as any;
}

/* ================================ GET ================================ */
export async function GET(req: Request, ctx: Ctx) {
  try {
    const user = await guard();
    const { path } = await ctx.params;
    const [a, b, c] = path ?? [];
    const url = new URL(req.url);
    switch (a) {
      case "overview":
        return Response.json({ success: true, data: await overview(user) });
      case "bots":
        if (!b) return Response.json({ success: true, data: await listBots(user) });
        if (c === "menu") return Response.json({ success: true, data: await botMenu(user, b) });
        return Response.json({ success: true, data: await botDetail(user, b) });
      case "whatsapp":
        return Response.json({ success: true, data: await waDetail(user, b!) });
      case "commands": {
        const botId = url.searchParams.get("botId");
        if (!botId) throw new ApiError("BOT_REQUIRED", 400, "botId wajib diisi");
        await ownedBot(user, botId);
        const rows = await db
          .select()
          .from(commands)
          .where(and(eq(commands.botId, botId), eq(commands.userId, user.id)))
          .orderBy(desc(commands.createdAt));
        return Response.json({ success: true, data: rows });
      }
      case "automations": {
        const botId = url.searchParams.get("botId");
        if (!botId) throw new ApiError("BOT_REQUIRED", 400, "botId wajib diisi");
        await ownedBot(user, botId);
        const rows = await db
          .select()
          .from(automations)
          .where(and(eq(automations.botId, botId), eq(automations.userId, user.id)))
          .orderBy(desc(automations.createdAt));
        return Response.json({ success: true, data: rows });
      }
      case "api-keys": {
        const rows = await db
          .select()
          .from(apiKeys)
          .where(eq(apiKeys.userId, user.id))
          .orderBy(desc(apiKeys.createdAt));
        return Response.json({ success: true, data: rows });
      }
      case "webhooks": {
        const rows = await db
          .select()
          .from(webhooks)
          .where(eq(webhooks.userId, user.id))
          .orderBy(desc(webhooks.createdAt));
        return Response.json({ success: true, data: rows });
      }
      case "logs":
        return Response.json({ success: true, data: await listLogs(user, url) });
      case "analytics":
        return Response.json({ success: true, data: await analytics(user, url) });
      case "tickets":
        if (!b)
          return Response.json({
            success: true,
            data: await db.select().from(tickets).where(eq(tickets.userId, user.id)).orderBy(desc(tickets.createdAt)).limit(50),
          });
        return Response.json({ success: true, data: await ticketDetail(user, b) });
      case "sessions": {
        const rows = await db
          .select()
          .from(sessions)
          .where(eq(sessions.userId, user.id))
          .orderBy(desc(sessions.createdAt))
          .limit(10);
        return Response.json({
          success: true,
          data: rows.map((s) => ({
            id: s.id,
            userAgent: s.userAgent,
            ip: s.ip,
            createdAt: s.createdAt,
            expiresAt: s.expiresAt,
          })),
        });
      }
      case "notifications": {
        const rows = await db
          .select()
          .from(notifications)
          .where(eq(notifications.userId, user.id))
          .orderBy(desc(notifications.createdAt))
          .limit(20);
        const [unread] = await db
          .select({ n: count() })
          .from(notifications)
          .where(and(eq(notifications.userId, user.id), eq(notifications.read, false)));
        return Response.json({ success: true, data: { notifications: rows, unread: unread?.n ?? 0 } });
      }
      case "billing":
        return Response.json({ success: true, data: await billing(user) });
      case "settings":
        return Response.json({ success: true, data: { user } });
      default:
        return jsonFail("NOT_FOUND", "Endpoint tidak ditemukan", 404);
    }
  } catch (e) {
    if (e instanceof ApiError) return jsonFail(e.code, e.message, e.status);
    console.error("[dashboard:GET]", e);
    return jsonFail("INTERNAL", "Terjadi kesalahan", 500);
  }
}

/* =============================== POST ================================ */
export async function POST(req: Request, ctx: Ctx) {
  try {
    const user = await guard();
    await checkOrigin(req);
    const { path } = await ctx.params;
    const [a, b, c] = path ?? [];
    const body = await readBody(req);
    switch (a) {
      case "bots":
        if (!b) return await createBot(user, body);
        if (c === "start" || c === "stop" || c === "restart" || c === "reconnect")
          return await botAction(user, b, c);
        if (c === "update") return await updateBot(user, b, body);
        break;
      case "commands":
        if (!b) return await createCommand(user, body);
        if (c === "toggle") return await toggleRow(commands, user, b, "command");
        break;
      case "automations":
        if (!b) return await createAutomation(user, body);
        if (c === "toggle") return await toggleRow(automations, user, b, "automation");
        break;
      case "api-keys":
        if (!b) return await createApiKey(user, body);
        if (c === "revoke") return await revokeApiKey(user, b);
        if (c === "rename")
          return Response.json({
            success: true,
            data: (await db.update(apiKeys).set({ name: String(body?.name ?? "API Key").slice(0, 64) }).where(and(eq(apiKeys.id, b), eq(apiKeys.userId, user.id))).returning())[0] ?? {},
          });
        break;
      case "webhooks":
        if (!b) return await createWebhook(user, body);
        if (c === "update") {
          const rows = await db
            .update(webhooks)
            .set({
              url: body?.url ? String(body.url).slice(0, 2000) : undefined,
              events: Array.isArray(body?.events) ? (body.events as string[]).filter((e: string) => ALLOWED_EVENTS.includes(e)) : undefined,
              enabled: typeof body?.enabled === "boolean" ? body.enabled : undefined,
            })
            .where(and(eq(webhooks.id, b), eq(webhooks.userId, user.id)))
            .returning();
          if (!rows.length) throw new ApiError("NOT_FOUND", 404, "Webhook tidak ditemukan");
          await addLog({ userId: user.id, event: "webhook.update", message: `Webhook ${b} diperbarui` });
          return Response.json({ success: true, data: rows[0] });
        }
        if (c === "toggle") return await toggleRow(webhooks, user, b, "webhook");
        if (c === "test") {
          try {
            await testWebhook(b, user.id);
          } catch {
            throw new ApiError("NOT_FOUND", 404, "Webhook tidak ditemukan");
          }
          return Response.json({ success: true, data: { testing: true, note: "Event webhook.test sedang dikirim (dengan retry)" } });
        }
        break;
      case "tickets":
        if (!b) return await createTicket(user, body);
        if (c === "reply") {
          const t = await ownedTicket(user, b);
          const msg = String(body?.body ?? "").trim();
          if (!msg) throw new ApiError("VALIDATION", 400, "Pesan tidak boleh kosong");
          await db.insert(ticketMessages).values({ ticketId: t.id, userId: user.id, body: msg });
          await db.update(tickets).set({ status: "waiting", updatedAt: new Date() }).where(eq(tickets.id, t.id));
          return Response.json({ success: true, data: { ok: true } });
        }
        if (c === "close") {
          const t = await ownedTicket(user, b);
          await db.update(tickets).set({ status: "closed", closedAt: new Date(), updatedAt: new Date() }).where(eq(tickets.id, t.id));
          return Response.json({ success: true, data: { ok: true } });
        }
        break;
      case "notifications":
        if (c === "read") {
          await db.update(notifications).set({ read: true }).where(and(eq(notifications.userId, user.id), eq(notifications.read, false)));
          return Response.json({ success: true, data: { ok: true } });
        }
        break;
      case "settings":
        if (c === "update") return await updateSettings(user, body);
        break;
      case "billing":
        if (c === "upgrade") return await upgrade(user, body);
        break;
      case "sessions":
        if (c === "revoke") {
          await db.delete(sessions).where(and(eq(sessions.id, b), eq(sessions.userId, user.id)));
          return Response.json({ success: true, data: { ok: true } });
        }
        break;
      case "whatsapp":
        if (b && c === "pairing") {
          const bot = await ownedBot(user, b);
          await engine.ensureEngineBoot();
          const res = await engine.requestPairing(b, String(body?.number ?? ""));
          return Response.json({ success: true, data: res });
        }
        if (b && c === "logout") {
          const bot = await ownedBot(user, b);
          await engine.ensureEngineBoot();
          await engine.waLogout(b);
          return Response.json({ success: true, data: { ok: true } });
        }
        break;
    }
    return jsonFail("NOT_FOUND", "Endpoint tidak ditemukan", 404);
  } catch (e) {
    if (e instanceof ApiError) return jsonFail(e.code, e.message, e.status);
    console.error("[dashboard:POST]", e);
    return jsonFail("INTERNAL", "Terjadi kesalahan", 500);
  }
}

/* ============================== DELETE =============================== */
export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const user = await guard();
    await checkOrigin(req);
    const { path } = await ctx.params;
    const [a, b] = path ?? [];
    switch (a) {
      case "bots": {
        const bot = await ownedBot(user, b!);
        await engine.ensureEngineBoot();
        await engine.stopBot(b!, "deleted");
        await db.delete(bots).where(eq(bots.id, b!));
        await addLog({ userId: user.id, event: "bot.delete", message: `Bot ${bot.name} dihapus` });
        notify(user.id, "bot.deleted", "Bot dihapus", `Bot ${bot.name} telah dihapus.`);
        return Response.json({ success: true, data: { ok: true } });
      }
      case "commands":
        await deleteRow(commands, user, b!, "command");
        return Response.json({ success: true, data: { ok: true } });
      case "automations":
        await deleteRow(automations, user, b!, "automation");
        return Response.json({ success: true, data: { ok: true } });
      case "api-keys": {
        const rows = await db
          .delete(apiKeys)
          .where(and(eq(apiKeys.id, b!), eq(apiKeys.userId, user.id)))
          .returning({ name: apiKeys.name });
        if (!rows.length) throw new ApiError("NOT_FOUND", 404, "API key tidak ditemukan");
        await addLog({ userId: user.id, level: "warning", event: "api_key.delete", message: `API key ${rows[0].name} dihapus` });
        return Response.json({ success: true, data: { ok: true } });
      }
      case "webhooks": {
        const rows = await db
          .delete(webhooks)
          .where(and(eq(webhooks.id, b!), eq(webhooks.userId, user.id)))
          .returning({ url: webhooks.url });
        if (!rows.length) throw new ApiError("NOT_FOUND", 404, "Webhook tidak ditemukan");
        await addLog({ userId: user.id, event: "webhook.delete", message: `Webhook dihapus: ${rows[0].url}` });
        return Response.json({ success: true, data: { ok: true } });
      }
    }
    return jsonFail("NOT_FOUND", "Endpoint tidak ditemukan", 404);
  } catch (e) {
    if (e instanceof ApiError) return jsonFail(e.code, e.message, e.status);
    console.error("[dashboard:DELETE]", e);
    return jsonFail("INTERNAL", "Terjadi kesalahan", 500);
  }
}

/* ============================ GET builders =========================== */
async function overview(user: User) {
  const sinceToday = new Date();
  sinceToday.setUTCHours(0, 0, 0, 0);
  const since7 = new Date(Date.now() - 7 * 24 * 3600e3);
  const [
    totalBots,
    onlineBots,
    messagesToday,
    apiToday,
    sub,
    sys,
    msg7,
    api7,
    anns,
    recentLogs,
  ] = await Promise.all([
    db.select({ n: count() }).from(bots).where(eq(bots.userId, user.id)),
    db.select({ n: count() }).from(bots).where(and(eq(bots.userId, user.id), eq(bots.status, "online"))),
    db.select({ n: count() }).from(messages).where(and(eq(messages.userId, user.id), gte(messages.createdAt, sinceToday))),
    db.select({ n: count() }).from(apiRequestLog).where(and(eq(apiRequestLog.userId, user.id), gte(apiRequestLog.createdAt, sinceToday))),
    db.select().from(subscriptions).where(eq(subscriptions.userId, user.id)).limit(1),
    computeSystemStatus(),
    daySeries(messages, messages.userId, user.id, since7, 7, "messages"),
    daySeries(apiRequestLog, apiRequestLog.userId, user.id, since7, 7, "api_request_log"),
    db.select().from(announcements).where(eq(announcements.published, true)).orderBy(desc(announcements.createdAt)).limit(2),
    db.select().from(logs).where(eq(logs.userId, user.id)).orderBy(desc(logs.createdAt)).limit(8),
  ]);
  const botRows = await db.select().from(bots).where(eq(bots.userId, user.id));
  const botIds = botRows.map((b) => b.id);
  const waRows = botIds.length > 0
    ? await db
        .select()
        .from(whatsappSessions)
        .where(inArray(whatsappSessions.botId, botIds))
    : [];
  const statusDist: Record<string, number> = { online: 0, offline: 0, other: 0 };
  for (const b of botRows) statusDist[b.status === "online" ? "online" : b.status === "offline" ? "offline" : "other"]++;
  const cnt = (r: { n: number }[] | undefined) => r?.[0]?.n ?? 0;
  return {
    stats: {
      totalBots: cnt(totalBots),
      onlineBots: cnt(onlineBots),
      offlineBots: cnt(totalBots) - cnt(onlineBots),
      messagesToday: cnt(messagesToday),
      apiRequestsToday: cnt(apiToday),
      plan: user.plan,
      expiration: sub?.[0]?.expiresAt ?? null,
    },
    charts: {
      messages7d: msg7,
      api7d: api7,
      botStatus: statusDist,
      connections: waRows.map((w) => ({
        botId: w.botId,
        status: w.status,
        phoneNumber: w.phoneNumber,
        lastConnectedAt: w.lastConnectedAt,
      })),
    },
    announcements: anns,
    recentLogs,
    serverStatus: sys,
  };
}

async function daySeries(
  table: any,
  userCol: any,
  userId: string,
  since: Date,
  days: number,
  tableName: string
): Promise<{ d: string; n: number }[]> {
  const dExpr = sql<string>`to_char(date_trunc('day', ${sql.raw(`"${tableName}"`)}."created_at"), 'YYYY-MM-DD')`;
  const rows = await db
    .select({ d: dExpr, n: count() })
    .from(table)
    .where(and(eq(userCol, userId), gte(table.createdAt, since)))
    .groupBy(dExpr)
    .orderBy(dExpr);
  const map = new Map(rows.map((r) => [r.d, r.n]));
  const out: { d: string; n: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const dt = new Date(Date.now() - i * 24 * 3600e3);
    const key = dt.toISOString().slice(0, 10);
    out.push({ d: key, n: map.get(key) ?? 0 });
  }
  return out;
}

async function botMenu(user: User, botId: string) {
  const bot = await ownedBot(user, botId);
  const rows = await db
    .select({ name: commands.name, category: commands.category })
    .from(commands)
    .where(and(eq(commands.botId, bot.id), eq(commands.enabled, true)));
  const owners = await db
    .select({ phone: botOwners.phone })
    .from(botOwners)
    .where(eq(botOwners.botId, bot.id));
  const { buildMenu } = await import("@/server/commands/core");
  return {
    text: buildMenu(bot, "owner", rows, [bot.ownerNumber ?? "", ...owners.map((o) => o.phone)].filter(Boolean)),
  };
}

async function listBots(user: User) {
  const rows = await db.select().from(bots).where(eq(bots.userId, user.id)).orderBy(desc(bots.createdAt));
  const waRows = await db
    .select()
    .from(whatsappSessions)
    .where(inArray(whatsappSessions.botId, rows.map((b) => b.id)));
  const waMap = new Map(waRows.map((w) => [w.botId, w]));
  return rows.map((b) => ({
    ...b,
    engine: engine.isEngineRunning(b.id),
    wa: waMap.get(b.id) ?? null,
  }));
}

async function botDetail(user: User, botId: string) {
  const bot = await ownedBot(user, botId);
  const [wa, eng] = await Promise.all([
    db.select().from(whatsappSessions).where(eq(whatsappSessions.botId, botId)).limit(1),
    engine.engineBotDetail(botId),
  ]);
  return { ...bot, engine: eng, wa: wa[0] ?? null };
}

async function waDetail(user: User, botId: string) {
  const bot = await ownedBot(user, botId);
  const [wa] = await db.select().from(whatsappSessions).where(eq(whatsappSessions.botId, botId)).limit(1);
  return { bot, wa: wa ?? null };
}

async function listLogs(user: User, url: URL) {
  const level = url.searchParams.get("level");
  const search = url.searchParams.get("search");
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const limit = 50;
  const conds = [eq(logs.userId, user.id)];
  if (level && level !== "all") conds.push(eq(logs.level, level));
  if (search) conds.push(like(sql`coalesce(${logs.event}, '') || ${logs.message}`, `%${search}%`));
  const [rows, totalRes] = await Promise.all([
    db.select().from(logs).where(and(...conds)).orderBy(desc(logs.createdAt)).limit(limit).offset((page - 1) * limit),
    db.select({ n: count() }).from(logs).where(and(...conds)),
  ]);
  return { logs: rows, page, totalPages: Math.max(1, Math.ceil((totalRes?.[0]?.n ?? 0) / limit)) };
}
async function analytics(user: User, url: URL) {
  const range = url.searchParams.get("range") || "7d";
  let from: Date;
  let to: Date = new Date();
  let days: number;
  if (range === "custom") {
    const f = url.searchParams.get("from");
    const tParam = url.searchParams.get("to");
    from = f ? new Date(`${f}T00:00:00Z`) : new Date(Date.now() - 7 * 24 * 3600e3);
    to = tParam ? new Date(`${tParam}T23:59:59Z`) : new Date();
    days = Math.min(90, Math.max(1, Math.ceil((to.getTime() - from.getTime()) / (24 * 3600e3))));
  } else if (range === "today") {
    from = new Date();
    from.setUTCHours(0, 0, 0, 0);
    days = 1;
  } else if (range === "30d") {
    from = new Date(Date.now() - 30 * 24 * 3600e3);
    days = 30;
  } else {
    from = new Date(Date.now() - 7 * 24 * 3600e3);
    days = 7;
  }
  const [sent, received, cmds, api, wh, errs, chats] = await Promise.all([
    db.select({ n: count() }).from(messages).where(and(eq(messages.userId, user.id), eq(messages.direction, "out"), gte(messages.createdAt, from), lte(messages.createdAt, to))),
    db.select({ n: count() }).from(messages).where(and(eq(messages.userId, user.id), eq(messages.direction, "in"), gte(messages.createdAt, from), lte(messages.createdAt, to))),
    db.select({ n: count() }).from(logs).where(and(eq(logs.userId, user.id), eq(logs.event, "command.run"), gte(logs.createdAt, from), lte(logs.createdAt, to))),
    db.select({ n: count() }).from(apiRequestLog).where(and(eq(apiRequestLog.userId, user.id), gte(apiRequestLog.createdAt, from), lte(apiRequestLog.createdAt, to))),
    db.select({ n: count() }).from(webhookEvents).where(and(eq(webhookEvents.userId, user.id), gte(webhookEvents.createdAt, from), lte(webhookEvents.createdAt, to))),
    db.select({ n: count() }).from(logs).where(and(eq(logs.userId, user.id), eq(logs.level, "error"), gte(logs.createdAt, from), lte(logs.createdAt, to))),
    db.select({ n: sql<number>`count(distinct "messages"."chat_jid")` }).from(messages).where(and(eq(messages.userId, user.id), gte(messages.createdAt, from), lte(messages.createdAt, to))),
  ]);
  const mSeries = await rangeSeries(messages, messages.userId, user.id, from, days, "messages");
  const aSeries = await rangeSeries(apiRequestLog, apiRequestLog.userId, user.id, from, days, "api_request_log");
  const first = (r: { n: number }[] | undefined) => r?.[0]?.n ?? 0;
  return {
    totals: {
      sent: first(sent),
      received: first(received),
      commands: first(cmds),
      api: first(api),
      webhooks: first(wh),
      errors: first(errs),
      activeUsers: first(chats),
    },
    series: { messages: mSeries, api: aSeries },
  };
}


async function rangeSeries(table: any, userCol: any, userId: string, from: Date, days: number, tableName: string) {
  const dExpr = sql<string>`to_char(date_trunc('day', ${sql.raw(`"${tableName}"`)}."created_at"), 'YYYY-MM-DD')`;
  const rows = await db
    .select({ d: dExpr, n: count() })
    .from(table)
    .where(and(eq(userCol, userId), gte(table.createdAt, from)))
    .groupBy(dExpr)
    .orderBy(dExpr);
  const map = new Map(rows.map((r) => [r.d, r.n]));
  const out: { d: string; n: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const dt = new Date(Date.now() - i * 24 * 3600e3);
    const key = dt.toISOString().slice(0, 10);
    out.push({ d: key, n: map.get(key) ?? 0 });
  }
  return out;
}

async function billing(user: User) {
  const [sub, payRows, plans, totalBots, msgTotal, apiTotal] = await Promise.all([
    db.select().from(subscriptions).where(eq(subscriptions.userId, user.id)).limit(1),
    db.select().from(payments).where(eq(payments.userId, user.id)).orderBy(desc(payments.createdAt)).limit(10),
    getPlans(),
    db.select({ n: count() }).from(bots).where(eq(bots.userId, user.id)),
    db.select({ n: count() }).from(messages).where(eq(messages.userId, user.id)),
    db.select({ n: count() }).from(apiRequestLog).where(eq(apiRequestLog.userId, user.id)),
  ]);
  const plan = plans.find((p) => p.id === user.plan.toLowerCase());
  const first = (r: { n: number }[] | undefined) => r?.[0]?.n ?? 0;
  return {
    plan: user.plan,
    planName: plan?.name ?? user.plan,
    subscription: sub?.[0] ?? null,
    usage: {
      bots: first(totalBots),
      botLimit: plan?.botLimit ?? 1,
      messages: first(msgTotal),
      apiRequests: first(apiTotal),
    },
    payments: payRows,
    plans,
  };
}

/* ============================ POST builders ========================== */
async function createBot(user: User, body: any) {
  const name = String(body?.name ?? "").trim();
  if (!name || name.length > 64) throw new ApiError("VALIDATION", 400, "Nama bot wajib (max 64)");
  const limit = await planBotLimit(user.plan);
  const [cur] = await db.select({ n: count() }).from(bots).where(eq(bots.userId, user.id));
  if ((cur?.n ?? 0) >= limit)
    throw new ApiError("BOT_LIMIT_REACHED", 402, `Plan ${user.plan} membatasi ${limit} bot. Upgrade untuk menambah.`);
  const [bot] = await db
    .insert(bots)
    .values({
      userId: user.id,
      name,
      runtime: "node",
      prefix: String(body?.prefix ?? "!").slice(0, 4) || "!",
      ownerNumber: body?.ownerNumber ? String(body.ownerNumber).replace(/\D/g, "") : null,
      description: body?.description ? String(body.description).slice(0, 500) : null,
    })
    .returning();
  await db.insert(whatsappSessions).values({ botId: bot.id, status: "disconnected" });
  // Seed the full WATER AI registry — every command becomes a real DB row
  // that the user can enable/disable per bot (menu is generated from it).
  for (const c of REGISTRY) {
    await db.insert(commands).values({
      botId: bot.id,
      userId: user.id,
      name: c.name,
      description: c.description,
      category: c.category,
      handler: c.handler,
      permissions: c.permissions,
      premium: !!c.premium,
    });
  }
  await addLog({ userId: user.id, botId: bot.id, level: "success", event: "bot.create", message: `Bot ${name} dibuat` });
  notify(user.id, "bot.created", "Bot baru dibuat", `${name} siap dihubungkan ke WhatsApp.`);
  return Response.json({ success: true, data: bot }, { status: 201 });
}

async function botAction(user: User, botId: string, action: string) {
  const bot = await ownedBot(user, botId);
  await engine.ensureEngineBoot();
  if (action === "start") {
    const res = await engine.startBot(bot);
    return Response.json({ success: true, data: res });
  }
  if (action === "stop") {
    await engine.stopBot(botId, "manual");
    return Response.json({ success: true, data: { ok: true } });
  }
  if (action === "restart") {
    await engine.restartBot(botId);
    return Response.json({ success: true, data: { ok: true } });
  }
  if (action === "reconnect") {
    const res = await engine.reconnectBot(botId);
    return Response.json({ success: true, data: res });
  }
  throw new ApiError("NOT_FOUND", 404, "Aksi tidak dikenal");
}

async function updateBot(user: User, botId: string, body: any) {
  await ownedBot(user, botId);
  const patch: any = {};
  if (typeof body?.name === "string" && body.name.trim()) patch.name = body.name.trim().slice(0, 64);
  if (typeof body?.prefix === "string" && body.prefix) patch.prefix = body.prefix.slice(0, 4);
  if (typeof body?.ownerNumber === "string") patch.ownerNumber = body.ownerNumber.replace(/\D/g, "").slice(0, 32) || null;
  if (typeof body?.description === "string") patch.description = body.description.slice(0, 500);
  if (body?.settings && typeof body.settings === "object") patch.settings = body.settings;
  if (!Object.keys(patch).length) throw new ApiError("VALIDATION", 400, "Tidak ada field yang diupdate");
  const rows = await db.update(bots).set(patch).where(eq(bots.id, botId)).returning();
  await addLog({ userId: user.id, botId, event: "bot.update", message: `Bot diupdate: ${Object.keys(patch).join(", ")}` });
  return Response.json({ success: true, data: rows[0] });
}

async function createCommand(user: User, body: any) {
  const botId = String(body?.botId ?? "");
  await ownedBot(user, botId);
  const name = String(body?.name ?? "").trim().toLowerCase();
  if (!name || !/^[a-z0-9_]+$/.test(name))
    throw new ApiError("VALIDATION", 400, "Nama command harus huruf kecil/angka/underscore");
  const rows = await db
    .insert(commands)
    .values({
      botId,
      userId: user.id,
      name,
      description: String(body?.description ?? "").slice(0, 200),
      category: String(body?.category ?? "general").slice(0, 32),
      handler: ["builtin", "menu", "help", "ping", "owner", "runtime", "status", "info", "text"].includes(body?.handler) ? body.handler : "text",
      permissions: ["all", "admin", "owner"].includes(body?.permissions) ? body.permissions : "all",
      extra: body?.text ? { text: String(body.text).slice(0, 500) } : {},
      enabled: body?.enabled !== false,
    })
    .returning();
  await addLog({ userId: user.id, botId, event: "command.create", message: `Command /${name} dibuat` });
  return Response.json({ success: true, data: rows[0] }, { status: 201 });
}

async function createAutomation(user: User, body: any) {
  const botId = String(body?.botId ?? "");
  await ownedBot(user, botId);
  const types = ["keyword", "autoReply", "welcome", "goodbye", "antiLink", "scheduled", "aiReply"];
  const type = types.includes(body?.type) ? body.type : null;
  if (!type) throw new ApiError("VALIDATION", 400, "Jenis automation tidak valid");
  const trigger: any = {};
  const action: any = {};
  if (type === "keyword") {
    trigger.contains = String(body?.contains ?? "");
    action.text = String(body?.text ?? "");
    if (!trigger.contains) throw new ApiError("VALIDATION", 400, "Keyword (contains) wajib diisi");
  } else if (type === "autoReply" || type === "welcome" || type === "goodbye" || type === "antiLink") {
    action.text = String(body?.text ?? "");
  } else if (type === "scheduled") {
    trigger.at = body?.at ? new Date(body.at).toISOString() : null;
    action.to = String(body?.to ?? "");
    action.text = String(body?.text ?? "");
    if (!trigger.at || !action.to) throw new ApiError("VALIDATION", 400, "Waktu (at) dan tujuan (to) wajib diisi");
  } else if (type === "aiReply") {
    action.enabled = true;
  }
  const rows = await db
    .insert(automations)
    .values({
      botId,
      userId: user.id,
      type,
      name: String(body?.name ?? type).slice(0, 64),
      trigger,
      action,
      enabled: body?.enabled !== false,
    })
    .returning();
  await addLog({ userId: user.id, botId, event: "automation.create", message: `Automation ${type} dibuat` });
  return Response.json({ success: true, data: rows[0] }, { status: 201 });
}

async function toggleRow(table: any, user: User, id: string, label: string) {
  const rows: any[] = await db
    .select()
    .from(table)
    .where(and(eq(table.id, id), eq(table.userId, user.id)))
    .limit(1);
  const row = rows[0];
  if (!row) throw new ApiError("NOT_FOUND", 404, `${label} tidak ditemukan`);
  const updated: any[] = (await db
    .update(table)
    .set({ enabled: !row.enabled })
    .where(eq(table.id, id))
    .returning()) as any;
  await addLog({
    userId: user.id,
    event: `${label}.toggle`,
    message: `${label} ${row.enabled ? "dinonaktifkan" : "diaktifkan"}`,
  });
  return Response.json({ success: true, data: updated[0] });
}

async function deleteRow(table: any, user: User, id: string, label: string) {
  const rows: any[] = (await db
    .delete(table)
    .where(and(eq(table.id, id), eq(table.userId, user.id)))
    .returning()) as any;
  if (!rows.length) throw new ApiError("NOT_FOUND", 404, `${label} tidak ditemukan`);
  await addLog({ userId: user.id, event: `${label}.delete`, message: `${label} dihapus` });
}

async function createApiKey(user: User, body: any) {
  const name = String(body?.name ?? "API Key").trim().slice(0, 64) || "API Key";
  const perms: string[] = Array.isArray(body?.permissions)
    ? (body.permissions as string[]).filter((p: string) => ALLOWED_PERMS.includes(p))
    : [];
  if (!perms.length) throw new ApiError("VALIDATION", 400, "Pilih minimal satu permission");
  let botId: string | null = null;
  if (body?.botId) botId = (await ownedBot(user, String(body.botId))).id;
  const fullKey = `WAC_${newToken(24)}`;
  const [row] = await db
    .insert(apiKeys)
    .values({
      userId: user.id,
      name,
      keyHash: sha256(fullKey),
      keyPrefix: fullKey.slice(0, 16),
      botId,
      permissions: perms,
      ipWhitelist: body?.ipWhitelist ? String(body.ipWhitelist).slice(0, 500) : null,
    })
    .returning();
  await addLog({ userId: user.id, level: "warning", event: "api_key.create", message: `API key "${name}" dibuat` });
  notify(user.id, "api_key.created", "API Key dibuat", `API key baru "${name}" berhasil dibuat.`);
  // Full key is returned exactly once.
  return Response.json({ success: true, data: { ...row, key: fullKey } }, { status: 201 });
}

async function revokeApiKey(user: User, id: string) {
  const rows = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, user.id)))
    .returning();
  if (!rows.length) throw new ApiError("NOT_FOUND", 404, "API key tidak ditemukan");
  await addLog({ userId: user.id, level: "warning", event: "api_key.revoke", message: `API key "${rows[0].name}" dicabut` });
  notify(user.id, "api_key.revoked", "API Key dicabut", `API key "${rows[0].name}" tidak lagi valid.`);
  return Response.json({ success: true, data: rows[0] });
}

async function createWebhook(user: User, body: any) {
  const url = String(body?.url ?? "");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ApiError("VALIDATION", 400, "URL webhook tidak valid");
  }
  if (!["http:", "https:"].includes(parsed.protocol))
    throw new ApiError("VALIDATION", 400, "URL harus http(s)");
  const events: string[] = Array.isArray(body?.events)
    ? (body.events as string[]).filter((e: string) => ALLOWED_EVENTS.includes(e))
    : [];
  if (!events.length) throw new ApiError("VALIDATION", 400, "Pilih minimal satu event");
  const [row] = await db
    .insert(webhooks)
    .values({
      userId: user.id,
      url,
      events,
      secret: `wsec_${newToken(16)}`,
    })
    .returning();
  await addLog({ userId: user.id, event: "webhook.create", message: `Webhook dibuat: ${url}` });
  return Response.json({ success: true, data: row }, { status: 201 });
}

async function ownedTicket(user: User, id: string) {
  const rows = await db
    .select()
    .from(tickets)
    .where(and(eq(tickets.id, id), eq(tickets.userId, user.id)))
    .limit(1);
  const t = rows[0];
  if (!t) throw new ApiError("NOT_FOUND", 404, "Ticket tidak ditemukan");
  return t;
}

async function createTicket(user: User, body: any) {
  const subject = String(body?.subject ?? "").trim().slice(0, 140);
  const msg = String(body?.message ?? "").trim();
  if (!subject) throw new ApiError("VALIDATION", 400, "Subjek wajib diisi");
  if (!msg) throw new ApiError("VALIDATION", 400, "Pesan wajib diisi");
  const priority = ["low", "normal", "high"].includes(body?.priority) ? body.priority : "normal";
  const [t] = await db
    .insert(tickets)
    .values({ userId: user.id, subject, priority })
    .returning();
  await db.insert(ticketMessages).values({ ticketId: t.id, userId: user.id, body: msg });
  await addLog({ userId: user.id, event: "ticket.create", message: `Ticket dibuat: ${subject}` });
  return Response.json({ success: true, data: t }, { status: 201 });
}

async function ticketDetail(user: User, id: string) {
  const t = await ownedTicket(user, id);
  const msgs = await db
    .select()
    .from(ticketMessages)
    .where(eq(ticketMessages.ticketId, t.id))
    .orderBy((col: any) => col.createdAt)
    .limit(100);
  return { ...t, messages: msgs.map((m) => ({ id: m.id, userId: m.userId, body: m.body, createdAt: m.createdAt, own: m.userId === user.id })) };
}

async function updateSettings(user: User, body: any) {
  const patch: any = {};
  if (typeof body?.username === "string" && body.username.trim().length >= 3)
    patch.username = body.username.trim().slice(0, 32);
  if (body?.password) {
    const cur = await verifyPassword(String(body.currentPassword ?? ""), (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0]!.passwordHash);
    if (!cur) throw new ApiError("INVALID_CREDENTIALS", 400, "Password lama salah");
    if (String(body.password).length < 8) throw new ApiError("VALIDATION", 400, "Password baru minimal 8 karakter");
    patch.passwordHash = await hashPassword(String(body.password));
  }
  if (!Object.keys(patch).length) throw new ApiError("VALIDATION", 400, "Tidak ada field yang diupdate");
  await db.update(users).set(patch).where(eq(users.id, user.id));
  await addLog({ userId: user.id, level: "warning", event: "settings.change", message: `Pengaturan diubah: ${Object.keys(patch).join(", ")}` });
  return Response.json({ success: true, data: { ok: true } });
}

async function upgrade(user: User, body: any) {
  const plans = await getPlans();
  const plan = plans.find((p) => p.id === String(body?.plan ?? ""));
  if (!plan) throw new ApiError("PLAN_NOT_FOUND", 400, "Plan tidak ditemukan");
  if (plan.id === "enterprise")
    throw new ApiError("CONTACT_SALES", 400, "Enterprise: hubungi tim sales melalui halaman Support.");
  const [pay] = await db
    .insert(payments)
    .values({
      userId: user.id,
      plan: plan.id,
      amount: plan.price,
      method: "manual",
      status: "pending",
      reference: `PAY-${Date.now().toString(36).toUpperCase()}`,
      note: `Upgrade request ke ${plan.name}`,
    })
    .returning();
  await addLog({ userId: user.id, level: "info", event: "billing.upgrade_requested", message: `Upgrade ${plan.name} — pending verifikasi` });
  notify(user.id, "billing.pending", "Upgrade diproses", `Permintaan ${plan.name} menunggu verifikasi admin.`);
  return Response.json({ success: true, data: { payment: pay, note: "Pembayaran diverifikasi oleh admin. Plan aktif setelah verifikasi." } }, { status: 201 });
}
