import { sseStream } from "@/server/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public SSE stream: live platform statistics & system status. */
export async function GET() {
  const stream = sseStream((event) =>
    ["stats", "system", "announcement", "hello", "ping"].includes(event)
  );
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
