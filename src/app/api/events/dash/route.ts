import { eq } from "drizzle-orm";
import { db } from "@/db";
import { bots } from "@/db/schema";
import { getSessionUser } from "@/server/lib";
import { sseStream } from "@/server/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Authenticated SSE stream for the dashboard:
 * bot status, WA connection, live messages, notifications.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return new Response(
      JSON.stringify({ success: false, error: { code: "UNAUTHORIZED", message: "Login required" } }),
      { status: 401, headers: { "content-type": "application/json" } }
    );
  }
  const own = await db
    .select({ id: bots.id })
    .from(bots)
    .where(eq(bots.userId, user.id));
  const botIds = new Set(own.map((b) => b.id));

  const stream = sseStream((event, data) => {
    if (["hello", "ping", "stats", "system"].includes(event)) return true;
    if (event === "notification") return (data as any)?.userId === user.id;
    if (["bot:status", "wa:status", "wa:pairing", "message"].includes(event))
      return botIds.has((data as any)?.botId);
    return false;
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
