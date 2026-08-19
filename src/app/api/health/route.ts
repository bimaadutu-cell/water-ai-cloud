import { sql } from "drizzle-orm";
import { db } from "@/db";
import { engineRunningCount } from "@/server/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let database: "ok" | "error" = "ok";
  try {
    await db.execute(sql`select 1`);
  } catch {
    database = "error";
  }
  return Response.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    services: {
      database,
      api: "ok",
      botEngine: "ok",
    },
    uptimeSec: Math.floor(process.uptime()),
    engine: {
      runningBots: engineRunningCount(),
    },
  });
}
