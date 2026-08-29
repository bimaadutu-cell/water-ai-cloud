import { sql } from "drizzle-orm";
import fs from "fs";
import { db } from "@/db";
import { engineRunningCount } from "@/server/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function binaryReady(name: string, configured?: string): boolean {
  if (configured?.trim()) return fs.existsSync(configured.trim());
  return name === "ffmpeg"
    ? fs.existsSync("/usr/bin/ffmpeg") || fs.existsSync("/usr/local/bin/ffmpeg")
    : fs.existsSync("/usr/local/bin/yt-dlp");
}

export async function GET() {
  let database: "connected" | "error" = "connected";
  try { await db.execute(sql`select 1`); } catch { database = "error"; }
  const ffmpeg = binaryReady("ffmpeg", process.env.FFMPEG_PATH);
  const ytdlp = binaryReady("yt-dlp", process.env.YTDLP_PATH);
  const ai = Boolean(process.env.GEMINI_API_KEY?.trim() || process.env.AI_API_KEY?.trim());
  const engine = engineRunningCount() >= 0 ? "ready" : "error";
  const ok = database === "connected" && engine === "ready";
  return Response.json({
    status: ok ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    database,
    whatsapp_engine: engine,
    ai: ai ? "configured" : "not_configured",
    ffmpeg: ffmpeg ? "ready" : "missing",
    ytdlp: ytdlp ? "ready" : "missing",
    uptimeSec: Math.floor(process.uptime()),
    engine: { runningBots: engineRunningCount() },
  }, { status: ok ? 200 : 503 });
}
