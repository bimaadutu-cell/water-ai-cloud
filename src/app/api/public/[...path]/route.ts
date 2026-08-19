import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { announcements } from "@/db/schema";
import { computeStats, computeSystemStatus } from "@/server/sse";
import { getPlans, getSetting, BOOT_TIME } from "@/server/lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const seg = path?.[0] ?? "";
  try {
    switch (seg) {
      case "stats":
        return Response.json({ success: true, data: await computeStats() });
      case "pricing":
        return Response.json({ success: true, data: await getPlans() });
      case "status": {
        const [status, uptimeStart] = await Promise.all([
          computeSystemStatus(),
          getSetting<string>("uptimeStartedAt"),
        ]);
        return Response.json({
          success: true,
          data: {
            ...status,
            uptimeStartedAt: uptimeStart ?? new Date(BOOT_TIME).toISOString(),
          },
        });
      }
      case "announcements": {
        const rows = await db
          .select()
          .from(announcements)
          .where(eq(announcements.published, true))
          .orderBy(desc(announcements.createdAt))
          .limit(5);
        return Response.json({ success: true, data: rows });
      }
      default:
        return Response.json(
          { success: false, error: { code: "NOT_FOUND", message: "Endpoint tidak ditemukan" } },
          { status: 404 }
        );
    }
  } catch (e: any) {
    return Response.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan" } },
      { status: 500 }
    );
  }
}
