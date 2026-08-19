import Link from "next/link";
import { eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { webhookEvents, logs } from "@/db/schema";
import { computeStats, computeSystemStatus } from "@/server/sse";
import { Logo } from "@/components/logo";
import { Badge } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "System Status" };

type IncidentRow = { message: string; event: string; createdAt: Date };
type FailureRow = { event: string; status: string; createdAt: Date };

function fmtUptime(sec: number) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}

export default async function StatusPage() {
  let status: Awaited<ReturnType<typeof computeSystemStatus>> | null = null;
  let stats: Awaited<ReturnType<typeof computeStats>> | null = null;
  let incidents: IncidentRow[] = [];
  let recentFailures: FailureRow[] = [];
  try {
    [status, stats] = await Promise.all([computeSystemStatus(), computeStats()]);
  } catch {
    /* noop */
  }
  try {
    incidents = await db
      .select({ message: logs.message, event: logs.event, createdAt: logs.createdAt })
      .from(logs)
      .where(eq(logs.level, "error"))
      .orderBy(desc(logs.createdAt))
      .limit(6);
    recentFailures = await db
      .select({ event: webhookEvents.event, status: webhookEvents.status, createdAt: webhookEvents.createdAt })
      .from(webhookEvents)
      .orderBy(desc(webhookEvents.createdAt))
      .limit(6);
  } catch {
    /* noop */
  }

  const items = status
    ? [
        { name: "Website", desc: "Landing page, dashboard, dan PWA", value: status.website },
        { name: "API", desc: "REST API & API Gateway v1", value: status.api },
        { name: "Database", desc: "PostgreSQL (Drizzle ORM)", value: status.database },
        { name: "Bot Engine", desc: "Engine Baileys multi-instance", value: status.botEngine },
        { name: "WhatsApp Gateway", desc: "Koneksi & pairing WhatsApp", value: status.whatsappGateway },
        { name: "Webhook Service", desc: "Dispatch & retry webhook", value: status.webhookService },
      ]
    : [];

  const allOk = items.every((i) => i.value === "operational");

  return (
    <div className="grid-bg relative min-h-screen">
      <div className="pointer-events-none absolute -top-32 left-1/2 h-[320px] w-[600px] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-[100px]" aria-hidden />
      <header className="mx-auto flex max-w-4xl items-center justify-between px-4 py-6 sm:px-6">
        <Link href="/"><Logo size={26} /></Link>
        <Link href="/" className="text-xs text-slate-400 hover:text-white">← Home</Link>
      </header>

      <main className="mx-auto max-w-4xl px-4 pb-20 sm:px-6">
        <div className="glass anim-fade-up rounded-2xl p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-4">
            <span className="relative flex h-4 w-4">
              <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-50 ${allOk ? "bg-emerald-400" : "bg-amber-400"}`} />
              <span className={`relative inline-flex h-4 w-4 rounded-full ${allOk ? "bg-emerald-400" : "bg-amber-400"}`} />
            </span>
            <div>
              <h1 className="font-display text-xl font-bold text-white sm:text-2xl">
                {allOk ? "All systems operational" : "Sebagian sistem terpengaruh"}
              </h1>
              <p className="text-xs text-slate-500">
                Uptime process: <b className="text-slate-300">{status ? fmtUptime(status.uptimeSec) : "—"}</b>
                {stats && (
                  <> · {stats.totalBots} bots · {stats.onlineConnections} WA terhubung</>
                )}
              </p>
            </div>
          </div>
          <div className="mt-6 space-y-2.5">
            {items.map((i) => (
              <div key={i.name} className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3.5">
                <div>
                  <p className="text-sm font-semibold text-white">{i.name}</p>
                  <p className="text-[11px] text-slate-500">{i.desc}</p>
                </div>
                <Badge tone={i.value === "operational" ? "green" : i.value === "degraded" ? "amber" : "red"}>
                  {i.value === "operational" ? "● Operational" : i.value === "degraded" ? "● Degraded" : "● Major Outage"}
                </Badge>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="card p-5">
            <h3 className="mb-3 text-sm font-bold text-white">Insiden Terakhir</h3>
            {incidents.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-600">Tidak ada error tercatat. 🎉</p>
            ) : (
              <div className="space-y-2">
                {incidents.map((e, i) => (
                  <div key={i} className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                    <p className="truncate text-[11px] text-slate-300">{e.message}</p>
                    <p className="text-[10px] text-slate-600">{e.event} · {new Date(e.createdAt).toLocaleString("id-ID")}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="card p-5">
            <h3 className="mb-3 text-sm font-bold text-white">Webhook Health (terakhir)</h3>
            {recentFailures.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-600">Belum ada event webhook.</p>
            ) : (
              <div className="space-y-2">
                {recentFailures.map((e, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                    <code className="text-[10px] text-slate-400">{e.event}</code>
                    <Badge tone={e.status === "success" ? "green" : e.status === "failed" ? "red" : "amber"}>
                      {e.status.toUpperCase()}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <p className="mt-8 text-center text-[11px] text-slate-600">
          Status dihitung real-time dari server · <Link href="/api/health" className="text-cyan-500 hover:underline">/api/health</Link>
        </p>
      </main>
    </div>
  );
}
