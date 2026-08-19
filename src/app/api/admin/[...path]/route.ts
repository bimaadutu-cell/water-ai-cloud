import os from "os";
import { execSync } from "child_process";
import { eq, and, desc, sql } from "drizzle-orm";
import { db, pool } from "@/db";
import {
  users,
  bots,
  whatsappSessions,
  subscriptions,
  payments,
  apiKeys,
  announcements,
  tickets,
  ticketMessages,
  logs,
  systemSettings,
  webhookEvents,
} from "@/db/schema";
import {
  ApiError,
  jsonFail,
  checkOrigin,
  requireAdmin,
  hashPassword,
  addLog,
  notify,
  getPlans,
  setSetting,
} from "@/server/lib";
import * as engine from "@/server/engine";
import { sseClientCount, ssePublish, computeSystemStatus } from "@/server/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Admin = Awaited<ReturnType<typeof requireAdmin>>;

interface Ctx {
  params: Promise<{ path: string[] }>;
}

async function readBody(req: Request) {
  return (await req.json().catch(() => null)) as any;
}

/* ================================ GET ================================ */
export async function GET(_req: Request, ctx: Ctx) {
  try {
    const admin = await requireAdmin();
    const { path } = await ctx.params;
    const [a] = path ?? [];
    switch (a) {
      case "metrics":
        return Response.json({ success: true, data: await metrics() });
      case "users": {
        const [rows, subs, botCounts, subCount] = await Promise.all([
          db.select().from(users).orderBy(desc(users.createdAt)).limit(200),
          db.select().from(subscriptions).limit(500),
          db
            .select({ userId: bots.userId, n: sql<number>`count(*)` })
            .from(bots)
            .groupBy(bots.userId),
          db.select().from(subscriptions),
        ]);
        void subCount;
        const subMap = new Map(subs.map((s) => [s.userId, s]));
        const botMap = new Map(botCounts.map((c) => [c.userId, c.n]));
        return Response.json({
          success: true,
          data: rows.map((u) => ({
            id: u.id,
            username: u.username,
            email: u.email,
            role: u.role,
            plan: u.plan,
            suspended: u.suspended,
            emailVerified: u.emailVerified,
            createdAt: u.createdAt,
            lastLoginAt: u.lastLoginAt,
            subscription: subMap.get(u.id) ?? null,
            botCount: botMap.get(u.id) ?? 0,
          })),
        });
      }
      case "bots": {
        const rows = await db
          .select({
            id: bots.id,
            name: bots.name,
            status: bots.status,
            whatsappNumber: bots.whatsappNumber,
            messagesSent: bots.messagesSent,
            messagesReceived: bots.messagesReceived,
            uptimeSec: bots.uptimeSec,
            userId: bots.userId,
            createdAt: bots.createdAt,
            username: users.username,
          })
          .from(bots)
          .innerJoin(users, eq(bots.userId, users.id))
          .orderBy(desc(bots.createdAt))
          .limit(200);
        return Response.json({ success: true, data: rows });
      }
      case "payments": {
        const rows = await db
          .select({
            id: payments.id,
            plan: payments.plan,
            amount: payments.amount,
            method: payments.method,
            status: payments.status,
            reference: payments.reference,
            note: payments.note,
            createdAt: payments.createdAt,
            userId: payments.userId,
            username: users.username,
          })
          .from(payments)
          .innerJoin(users, eq(payments.userId, users.id))
          .orderBy(desc(payments.createdAt))
          .limit(100);
        return Response.json({ success: true, data: rows });
      }
      case "api-keys": {
        const rows = await db
          .select({
            id: apiKeys.id,
            name: apiKeys.name,
            keyPrefix: apiKeys.keyPrefix,
            permissions: apiKeys.permissions,
            requestCount: apiKeys.requestCount,
            lastUsedAt: apiKeys.lastUsedAt,
            revokedAt: apiKeys.revokedAt,
            createdAt: apiKeys.createdAt,
            userId: apiKeys.userId,
            username: users.username,
          })
          .from(apiKeys)
          .innerJoin(users, eq(apiKeys.userId, users.id))
          .orderBy(desc(apiKeys.createdAt))
          .limit(200);
        return Response.json({ success: true, data: rows });
      }
      case "announcements": {
        const rows = await db
          .select()
          .from(announcements)
          .orderBy(desc(announcements.createdAt))
          .limit(50);
        return Response.json({ success: true, data: rows });
      }
      case "tickets": {
        const rows = await db
          .select({
            id: tickets.id,
            subject: tickets.subject,
            status: tickets.status,
            priority: tickets.priority,
            createdAt: tickets.createdAt,
            updatedAt: tickets.updatedAt,
            userId: tickets.userId,
            username: users.username,
          })
          .from(tickets)
          .innerJoin(users, eq(tickets.userId, users.id))
          .orderBy(desc(tickets.createdAt))
          .limit(100);
        const withMsgs = await Promise.all(
          rows.map(async (t) => {
            const msgs = await db
              .select()
              .from(ticketMessages)
              .where(eq(ticketMessages.ticketId, t.id))
              .orderBy((c: any) => c.createdAt)
              .limit(30);
            return { ...t, messages: msgs };
          })
        );
        return Response.json({ success: true, data: withMsgs });
      }
      case "pricing":
        return Response.json({ success: true, data: await getPlans() });
      case "maintenance": {
        const m = (await (async () => {
          const rows = await db
            .select()
            .from(systemSettings)
            .where(eq(systemSettings.key, "maintenance"))
            .limit(1);
          return rows[0]?.value ?? { active: false, message: "", eta: "" };
        })()) as { active: boolean; message: string; eta: string };
        return Response.json({ success: true, data: m });
      }
      case "logs": {
        const rows = await db
          .select({
            id: logs.id,
            level: logs.level,
            event: logs.event,
            message: logs.message,
            status: logs.status,
            createdAt: logs.createdAt,
            botId: logs.botId,
            username: users.username,
          })
          .from(logs)
          .leftJoin(users, eq(logs.userId, users.id))
          .orderBy(desc(logs.createdAt))
          .limit(150);
        return Response.json({ success: true, data: rows });
      }
      case "webhook-health": {
        const rows = await db
          .select({
            event: webhookEvents.event,
            status: webhookEvents.status,
            responseCode: webhookEvents.responseCode,
            attempts: webhookEvents.attempts,
            createdAt: webhookEvents.createdAt,
          })
          .from(webhookEvents)
          .orderBy(desc(webhookEvents.createdAt))
          .limit(50);
        return Response.json({ success: true, data: rows });
      }
      default:
        return jsonFail("NOT_FOUND", "Endpoint tidak ditemukan", 404);
    }
  } catch (e) {
    if (e instanceof ApiError) return jsonFail(e.code, e.message, e.status);
    console.error("[admin:GET]", e);
    return jsonFail("INTERNAL", "Terjadi kesalahan", 500);
  }
}

/* =============================== POST ================================ */
export async function POST(req: Request, ctx: Ctx) {
  try {
    const admin = await requireAdmin();
    await checkOrigin(req);
    const { path } = await ctx.params;
    const [a, b, c] = path ?? [];
    const body = await readBody(req);
    switch (a) {
      case "users":
        if (!b) return await createUser(admin, body);
        if (c === "role") return await userRole(admin, b, body);
        if (c === "suspend") return await userSuspend(admin, b, body);
        if (c === "plan") return await userPlan(admin, b, body);
        if (c === "delete") return await userDelete(admin, b);
        break;
      case "bots":
        if (b && c === "stop") {
          const bot = (await db.select().from(bots).where(eq(bots.id, b)).limit(1))[0];
          if (!bot) throw new ApiError("BOT_NOT_FOUND", 404, "Bot tidak ditemukan");
          await engine.ensureEngineBoot();
          await engine.stopBot(b, "admin-stop");
          addLog({ userId: admin.id, botId: b, level: "warning", event: "admin.bot_stop", message: `Admin menghentikan bot ${bot.name}` });
          return Response.json({ success: true, data: { ok: true } });
        }
        if (b && c === "restart") {
          await engine.ensureEngineBoot();
          await engine.restartBot(b);
          addLog({ userId: admin.id, botId: b, level: "warning", event: "admin.bot_restart", message: `Admin me-restart bot ${b}` });
          return Response.json({ success: true, data: { ok: true } });
        }
        break;
      case "payments":
        if (b && c === "verify") return await paymentVerify(admin, b, body);
        if (b && c === "fail") return await paymentFail(admin, b, body);
        break;
      case "announcements":
        if (!b) {
          const title = String(body?.title ?? "").trim().slice(0, 140);
          const content = String(body?.content ?? "").trim();
          if (!title) throw new ApiError("VALIDATION", 400, "Judul wajib diisi");
          const [row] = await db
            .insert(announcements)
            .values({
              title,
              content,
              type: ["info", "update", "warning", "maintenance"].includes(body?.type) ? body.type : "info",
              published: body?.published !== false,
            })
            .returning();
          addLog({ userId: admin.id, level: "warning", event: "admin.announcement", message: `Announcement dibuat: ${title}` });
          ssePublish("announcement", { id: row.id, title });
          return Response.json({ success: true, data: row }, { status: 201 });
        }
        if (c === "publish") {
          await db
            .update(announcements)
            .set({ published: !!body?.published })
            .where(eq(announcements.id, b));
          ssePublish("announcement", { id: b, title: "" });
          return Response.json({ success: true, data: { ok: true } });
        }
        break;
      case "pricing": {
        const plans = body?.plans;
        if (!Array.isArray(plans) || !plans.length)
          throw new ApiError("VALIDATION", 400, "plans (array) wajib diisi");
        for (const p of plans) {
          if (typeof p?.id !== "string" || typeof p?.name !== "string" || typeof p?.price !== "number")
            throw new ApiError("VALIDATION", 400, "Setiap plan butuh id, name, price (number)");
        }
        await setSetting("pricing", plans);
        addLog({ userId: admin.id, level: "warning", event: "admin.pricing", message: "Pricing diperbarui" });
        return Response.json({ success: true, data: plans });
      }
      case "maintenance": {
        const prev = (await getSettingSafe("maintenance")) as any;
        const next = {
          active: !!body?.active,
          message: String(body?.message ?? prev?.message ?? "Platform sedang dalam perawatan."),
          eta: String(body?.eta ?? ""),
        };
        await setSetting("maintenance", next);
        addLog({ userId: admin.id, level: "warning", event: "admin.maintenance", message: `Maintenance ${next.active ? "DIAKTIFKAN" : "dimatikan"}` });
        if (next.active) {
          const all = await db.select({ id: users.id }).from(users);
          for (const u of all)
            if (u.id !== admin.id) notify(u.id, "maintenance", "Mode maintenance", next.message);
        }
        return Response.json({ success: true, data: next });
      }
      case "tickets":
        if (b && c === "reply") {
          const t = (await db.select().from(tickets).where(eq(tickets.id, b)).limit(1))[0];
          if (!t) throw new ApiError("NOT_FOUND", 404, "Ticket tidak ditemukan");
          const msg = String(body?.body ?? "").trim();
          if (!msg) throw new ApiError("VALIDATION", 400, "Pesan wajib diisi");
          await db.insert(ticketMessages).values({ ticketId: t.id, userId: admin.id, body: msg });
          await db.update(tickets).set({ status: "answered", updatedAt: new Date() }).where(eq(tickets.id, t.id));
          notify(t.userId, "support.replied", "Ticket dijawab", `Ticket "${t.subject}" sudah dijawab oleh admin.`);
          return Response.json({ success: true, data: { ok: true } });
        }
        if (b && c === "close") {
          await db.update(tickets).set({ status: "closed", closedAt: new Date(), updatedAt: new Date() }).where(eq(tickets.id, b));
          return Response.json({ success: true, data: { ok: true } });
        }
        break;
    }
    return jsonFail("NOT_FOUND", "Endpoint tidak ditemukan", 404);
  } catch (e) {
    if (e instanceof ApiError) return jsonFail(e.code, e.message, e.status);
    console.error("[admin:POST]", e);
    return jsonFail("INTERNAL", "Terjadi kesalahan", 500);
  }
}

/* ============================== DELETE =============================== */
export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const admin = await requireAdmin();
    await checkOrigin(req);
    const { path } = await ctx.params;
    const [a, b] = path ?? [];
    if (a === "announcements" && b) {
      const rows = await db.delete(announcements).where(eq(announcements.id, b)).returning();
      if (!rows.length) throw new ApiError("NOT_FOUND", 404, "Announcement tidak ditemukan");
      addLog({ userId: admin.id, event: "admin.announcement_delete", message: `Announcement ${b} dihapus` });
      ssePublish("announcement", { id: b, title: "" });
      return Response.json({ success: true, data: { ok: true } });
    }
    return jsonFail("NOT_FOUND", "Endpoint tidak ditemukan", 404);
  } catch (e) {
    if (e instanceof ApiError) return jsonFail(e.code, e.message, e.status);
    console.error("[admin:DELETE]", e);
    return jsonFail("INTERNAL", "Terjadi kesalahan", 500);
  }
}

/* ============================== helpers ============================== */
async function getSettingSafe(key: string) {
  const rows = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.key, key))
    .limit(1);
  return rows[0]?.value ?? null;
}

async function metrics() {
  const cpus = os.cpus();
  let cpuPct = 0;
  try {
    let totalIdle = 0;
    let totalTick = 0;
    for (const cpu of cpus) {
      const t = Object.values(cpu.times).reduce((a, b) => a + b, 0);
      totalIdle += cpu.times.idle;
      totalTick += t;
    }
    cpuPct = totalTick ? Math.round((1 - totalIdle / totalTick) * 100) : 0;
  } catch {
    cpuPct = 0;
  }
  const memTotal = os.totalmem();
  const memFree = os.freemem();
  const procMem = process.memoryUsage();
  let disk: { usedPct: number; sizeGb: number } | null = null;
  try {
    const out = execSync("df -kP / | tail -1", { timeout: 3000 }).toString().split(/\s+/);
    const sizeKb = parseInt(out[1], 10);
    const usedKb = parseInt(out[2], 10);
    disk = {
      usedPct: sizeKb ? Math.round((usedKb / sizeKb) * 100) : 0,
      sizeGb: Math.round(sizeKb / 1048576),
    };
  } catch {
    disk = null;
  }
  const [botsOnline, waConnected, usersTotal, webhookFails] = await Promise.all([
    db.select({ n: sql<number>`count(*)` }).from(bots).where(eq(bots.status, "online")),
    db.select({ n: sql<number>`count(*)` }).from(whatsappSessions).where(eq(whatsappSessions.status, "connected")),
    db.select({ n: sql<number>`count(*)` }).from(users),
    db.select({ n: sql<number>`count(*)` }).from(webhookEvents).where(sql`"webhook_events"."created_at" > now() - interval '1 hour' and "webhook_events"."status" = 'failed'`),
  ]);
  return {
    cpu: { cores: cpus.length, loadAvg1: os.loadavg()[0], usagePct: cpuPct },
    memory: {
      totalGb: +(memTotal / 1073741824).toFixed(1),
      freeGb: +(memFree / 1073741824).toFixed(1),
      usedPct: Math.round(((memTotal - memFree) / memTotal) * 100),
      processMb: Math.round(procMem.heapUsed / 1024),
    },
    disk,
    uptimeSec: Math.floor(process.uptime()),
    platform: os.platform(),
    node: process.version,
    db: {
      poolTotal: pool.totalCount,
      poolIdle: pool.idleCount,
      poolWaiting: pool.waitingCount,
    },
    sseClients: sseClientCount(),
    engine: { runningBots: engine.engineRunningCount() },
    counts: {
      onlineBots: botsOnline?.[0]?.n ?? 0,
      waConnected: waConnected?.[0]?.n ?? 0,
      users: usersTotal?.[0]?.n ?? 0,
      webhookFails1h: webhookFails?.[0]?.n ?? 0,
    },
    system: await computeSystemStatus(),
  };
}

async function createUser(admin: Admin, body: any) {
  const username = String(body?.username ?? "").trim().toLowerCase();
  const email = String(body?.email ?? "").trim();
  const password = String(body?.password ?? "");
  if (username.length < 3 || !email || password.length < 8)
    throw new ApiError("VALIDATION", 400, "username (min 3), email, dan password (min 8) wajib");
  const role = ["USER", "RESELLER", "ADMIN"].includes(body?.role) ? body.role : "USER";
  const plan = String(body?.plan ?? "FREE").toUpperCase();
  const [user] = await db
    .insert(users)
    .values({
      username,
      email,
      passwordHash: await hashPassword(password),
      role,
      plan,
      emailVerified: true,
    })
    .returning();
  await db.insert(subscriptions).values({ userId: user.id, plan });
  addLog({ userId: admin.id, level: "warning", event: "admin.user_create", message: `User ${username} dibuat (${role}, ${plan})` });
  return Response.json({ success: true, data: { id: user.id, username, email } }, { status: 201 });
}

async function userRole(admin: Admin, id: string, body: any) {
  const role = ["USER", "RESELLER", "ADMIN"].includes(body?.role) ? body.role : null;
  if (!role) throw new ApiError("VALIDATION", 400, "Role tidak valid");
  const rows = await db.update(users).set({ role }).where(eq(users.id, id)).returning();
  if (!rows.length) throw new ApiError("NOT_FOUND", 404, "User tidak ditemukan");
  addLog({ userId: admin.id, level: "warning", event: "admin.user_role", message: `Role ${rows[0].username} → ${role}` });
  return Response.json({ success: true, data: { ok: true } });
}

async function userSuspend(admin: Admin, id: string, body: any) {
  if (id === admin.id) throw new ApiError("SELF_ACTION", 400, "Admin tidak bisa mensuspend dirinya");
  const suspended = !!body?.suspended;
  const rows = await db.update(users).set({ suspended }).where(eq(users.id, id)).returning();
  if (!rows.length) throw new ApiError("NOT_FOUND", 404, "User tidak ditemukan");
  addLog({ userId: admin.id, level: "warning", event: "admin.user_suspend", message: `User ${rows[0].username} ${suspended ? "disuspend" : "diaktifkan kembali"}` });
  return Response.json({ success: true, data: { ok: true } });
}

async function userPlan(admin: Admin, id: string, body: any) {
  const plans = await getPlans();
  const plan = plans.find((p) => p.id === String(body?.plan ?? "").toLowerCase());
  if (!plan) throw new ApiError("PLAN_NOT_FOUND", 400, "Plan tidak ditemukan");
  const rows = await db.update(users).set({ plan: plan.name }).where(eq(users.id, id)).returning();
  if (!rows.length) throw new ApiError("NOT_FOUND", 404, "User tidak ditemukan");
  const existing = await db.select().from(subscriptions).where(eq(subscriptions.userId, id)).limit(1);
  const expiresAt = plan.period === "month" ? new Date(Date.now() + 30 * 24 * 3600e3) : null;
  if (existing.length) {
    await db.update(subscriptions).set({ plan: plan.name, status: "active", expiresAt }).where(eq(subscriptions.userId, id));
  } else {
    await db.insert(subscriptions).values({ userId: id, plan: plan.name, status: "active", expiresAt });
  }
  addLog({ userId: admin.id, level: "warning", event: "admin.user_plan", message: `Plan ${rows[0].username} → ${plan.name}` });
  notify(id, "billing.plan_changed", "Plan diperbarui", `Plan Anda diubah admin menjadi ${plan.name}.`);
  return Response.json({ success: true, data: { ok: true } });
}

async function userDelete(admin: Admin, id: string) {
  if (id === admin.id) throw new ApiError("SELF_ACTION", 400, "Admin tidak bisa menghapus dirinya");
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!rows.length) throw new ApiError("NOT_FOUND", 404, "User tidak ditemukan");
  await db.delete(users).where(eq(users.id, id));
  addLog({ userId: admin.id, level: "error", event: "admin.user_delete", message: `User ${rows[0].username} dihapus` });
  return Response.json({ success: true, data: { ok: true } });
}

async function paymentVerify(admin: Admin, id: string, body: any) {
  const rows = await db.select().from(payments).where(eq(payments.id, id)).limit(1);
  const pay = rows[0];
  if (!pay) throw new ApiError("NOT_FOUND", 404, "Pembayaran tidak ditemukan");
  await db.update(payments).set({ status: "success" }).where(eq(payments.id, id));
  const userRows = await db.select().from(users).where(eq(users.id, pay.userId)).limit(1);
  const user = userRows[0];
  if (user) {
    const plans = await getPlans();
    const plan = plans.find((p) => p.id === pay.plan.toLowerCase());
    const expiresAt = plan && plan.period === "month" ? new Date(Date.now() + 30 * 24 * 3600e3) : null;
    await db.update(users).set({ plan: plan?.name ?? pay.plan.toUpperCase() }).where(eq(users.id, user.id));
    const existing = await db.select().from(subscriptions).where(eq(subscriptions.userId, user.id)).limit(1);
    if (existing.length) {
      await db.update(subscriptions).set({ plan: pay.plan.toUpperCase(), status: "active", expiresAt }).where(eq(subscriptions.userId, user.id));
    } else {
      await db.insert(subscriptions).values({ userId: user.id, plan: pay.plan.toUpperCase(), status: "active", expiresAt });
    }
    notify(user.id, "billing.activated", "Plan aktif", `Pembayaran ${pay.reference} terverifikasi. Plan ${pay.plan} aktif.`);
  }
  addLog({ userId: admin.id, level: "success", event: "admin.payment_verify", message: `Pembayaran ${pay.reference} diverifikasi` });
  return Response.json({ success: true, data: { ok: true } });
}

async function paymentFail(admin: Admin, id: string, body: any) {
  const rows = await db.update(payments).set({ status: "failed", note: body?.note ? String(body.note).slice(0, 300) : null }).where(eq(payments.id, id)).returning();
  if (!rows.length) throw new ApiError("NOT_FOUND", 404, "Pembayaran tidak ditemukan");
  notify(rows[0].userId, "billing.failed", "Pembayaran ditolak", `Pembayaran ${rows[0].reference} tidak disetujui.`);
  addLog({ userId: admin.id, level: "warning", event: "admin.payment_fail", message: `Pembayaran ${rows[0].reference} ditandai gagal` });
  return Response.json({ success: true, data: { ok: true } });
}
