import { sql } from "drizzle-orm";
import { db, ensureDatabaseReady } from "@/db";
import { engineRunningCount } from "@/server/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let database: "ok" | "error" = "ok";
  let databaseError: string | undefined;
  try {
    await ensureDatabaseReady();
    await db.execute(sql`select 1`);
  } catch (error) {
    database = "error";
    databaseError = error instanceof Error ? error.message.slice(0, 240) : "Unknown database error";
  }
  return Response.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    services: {
      database,
      ...(databaseError ? { databaseError } : {}),
      api: "ok",
      botEngine: "ok",
    },
    uptimeSec: Math.floor(process.uptime()),
    engine: {
      runningBots: engineRunningCount(),
    },
  });
}
