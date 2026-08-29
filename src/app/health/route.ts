import { sql } from "drizzle-orm";
import { db } from "@/db";
import { engineRunningCount } from "@/server/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let database: "connected" | "error" = "connected";
  try {
    await db.execute(sql`select 1`);
  } catch {
    database = "error";
  }
  const engineReady = engineRunningCount() > 0;
  return Response.json({
    status: database === "connected" ? "ok" : "degraded",
    database,
    whatsapp_engine: engineReady ? "ready" : "idle",
    ai: process.env.GEMINI_API_KEY || process.env.AI_API_KEY ? "ready" : "not_configured",
    timestamp: new Date().toISOString(),
  }, { status: database === "connected" ? 200 : 503 });
}
