import { count, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  bots,
  whatsappSessions,
  messages,
  apiRequestLog,
  users,
  webhooks,
  webhookEvents,
} from "@/db/schema";
import { BOOT_TIME } from "./lib";

type Listener = (event: string, data: unknown) => void;

const listeners = new Set<Listener>();
let tickerStarted = false;

export function sseSubscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function ssePublish(event: string, data: unknown) {
  for (const l of Array.from(listeners)) {
    try {
      l(event, data);
    } catch {
      /* ignore slow consumers */
    }
  }
}

export function sseClientCount(): number {
  return listeners.size;
}

/* ------------------------- public statistics -------------------------- */
export interface PublicStats {
  activeBots: number;
  totalBots: number;
  onlineConnections: number;
  messagesProcessed: number;
  apiRequests: number;
  activeUsers: number;
  uptimeSec: number;
}

export async function computeStats(): Promise<PublicStats> {
  const results = await Promise.all([
    db.select({ n: count() }).from(bots).where(eq(bots.status, "online")),
    db.select({ n: count() }).from(bots),
    db
      .select({ n: count() })
      .from(whatsappSessions)
      .where(eq(whatsappSessions.status, "connected")),
    db.select({ n: count() }).from(messages),
    db.select({ n: count() }).from(apiRequestLog),
    db.select({ n: count() }).from(users),
  ]);
  const n = (r: { n: number }[]) => r[0]?.n ?? 0;
  return {
    activeBots: n(results[0]),
    totalBots: n(results[1]),
    onlineConnections: n(results[2]),
    messagesProcessed: n(results[3]),
    apiRequests: n(results[4]),
    activeUsers: n(results[5]),
    uptimeSec: Math.floor((Date.now() - BOOT_TIME) / 1000),
  };
}

export interface SystemStatus {
  website: string;
  api: string;
  database: string;
  botEngine: string;
  whatsappGateway: string;
  webhookService: string;
  uptimeSec: number;
}

export async function computeSystemStatus(): Promise<SystemStatus> {
  let database = "operational";
  try {
    await db.execute(sql`select 1`);
  } catch {
    database = "major outage";
  }
  const waRes = await db
    .select({ n: count() })
    .from(whatsappSessions)
    .where(eq(whatsappSessions.status, "connected"));
  const waOnline = waRes[0]?.n ?? 0;

  const failedRes = await db
    .select({ n: count() })
    .from(webhookEvents)
    .where(
      sql`${webhookEvents.createdAt} > now() - interval '1 hour' and ${webhookEvents.status} = 'failed'`
    );
  const hooksRes = await db.select({ n: count() }).from(webhooks);
  const failed = failedRes[0]?.n ?? 0;
  const hooksTotal = hooksRes[0]?.n ?? 0;
  const webhookService =
    failed > 3 && hooksTotal > 0 ? "degraded" : "operational";

  return {
    website: "operational",
    api: "operational",
    database,
    botEngine: "operational",
    whatsappGateway: waOnline > 0 ? "operational" : "operational",
    webhookService,
    uptimeSec: Math.floor((Date.now() - BOOT_TIME) / 1000),
  };
}

/* ----------------------------- SSE ticker ----------------------------- */
function ensureTicker() {
  if (tickerStarted) return;
  tickerStarted = true;
  setInterval(async () => {
    try {
      const stats = await computeStats();
      ssePublish("stats", stats);
      const status = await computeSystemStatus();
      ssePublish("system", status);
    } catch {
      /* ignore */
    }
  }, 10000);
  setInterval(() => {
    ssePublish("ping", { at: Date.now() });
  }, 25000);
}

export function startSse() {
  ensureTicker();
}

/**
 * Build a ReadableStream that emits Server-Sent Events.
 * `filter` optionally restricts which events pass through.
 */
export function sseStream(
  filter?: (event: string, data: unknown) => boolean
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let unsub: (() => void) | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const cleanup = () => {
        if (timer) clearInterval(timer);
        timer = null;
        unsub?.();
        unsub = null;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          cleanup();
        }
      };
      unsub = sseSubscribe((e, d) => {
        if (filter && !filter(e, d)) return;
        send(e, d);
      });
      send("hello", { at: Date.now() });
      timer = setInterval(() => {
        send("ping", { at: Date.now() });
      }, 30000);
      ensureTicker();
    },
    cancel() {
      if (timer) clearInterval(timer);
      unsub?.();
    },
  });
}
