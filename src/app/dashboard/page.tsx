"use client";

import Link from "next/link";
import { useEffect } from "react";
import {
  api,
  useApi,
  Icon,
  Badge,
  StatusPill,
  Spinner,
  ErrorState,
  MiniBars,
  MiniLine,
  EmptyState,
  timeAgo,
} from "@/components/ui";

type Overview = {
  stats: {
    totalBots: number;
    onlineBots: number;
    offlineBots: number;
    messagesToday: number;
    apiRequestsToday: number;
    plan: string;
    expiration: string | null;
  };
  charts: {
    messages7d: { d: string; n: number }[];
    api7d: { d: string; n: number }[];
    botStatus: { online: number; offline: number; other: number };
    connections: { botId: string; status: string; phoneNumber: string | null; lastConnectedAt: string | null }[];
  };
  announcements: { id: string; title: string; content: string; type: string; createdAt: string }[];
  recentLogs: { id: string; level: string; event: string; message: string; createdAt: string }[];
  serverStatus: { database: string; website: string };
};

export default function OverviewPage() {
  const { data, loading, error, reload } = useApi<Overview>("/dashboard/overview");
  const { data: settings } = useApi<{ user: { username: string } }>("/dashboard/settings");

  useEffect(() => {
    const fn = () => reload();
    window.addEventListener("wac:refresh", fn);
    return () => window.removeEventListener("wac:refresh", fn);
  }, [reload]);

  if (loading && !data)
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-slate-500">
        <Spinner size={22} />
        <p className="text-xs">Membuat dashboard Anda...</p>
      </div>
    );
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  const cards = [
    { label: "Total Bots", value: data.stats.totalBots, icon: "bot", tone: "text-cyan-300" },
    { label: "Online", value: data.stats.onlineBots, icon: "wifi", tone: "text-emerald-400" },
    { label: "Offline", value: data.stats.offlineBots, icon: "stop", tone: "text-slate-400" },
    { label: "Messages Today", value: data.stats.messagesToday.toLocaleString(), icon: "msg", tone: "text-blue-300" },
    { label: "API Requests Today", value: data.stats.apiRequestsToday.toLocaleString(), icon: "code", tone: "text-amber-300" },
    { label: "Current Plan", value: data.stats.plan, icon: "card", tone: "text-cyan-300" },
  ];

  return (
    <div className="space-y-6">
      {/* greeting */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-white">
            Welcome back, <span className="text-gradient">{settings?.user?.username ?? "developer"}</span>
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Plan <b className="text-cyan-400">{data.stats.plan}</b>
            {data.stats.expiration ? (
              <> · Berakhir {new Date(data.stats.expiration).toLocaleDateString("id-ID")}</>
            ) : (
              <> · Berlangsung terus</>
            )}
          </p>
        </div>
        <Badge tone={data.serverStatus.database === "operational" ? "green" : "amber"}>
          <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-current" />
          {data.serverStatus.database === "operational" ? "OPERATIONAL" : "DEGRADED"}
        </Badge>
      </div>

      {/* stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map((c) => (
          <div key={c.label} className="card p-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{c.label}</span>
              <Icon name={c.icon} size={14} className="text-slate-600" />
            </div>
            <p className={`mt-2 font-display text-2xl font-bold tabular-nums ${c.tone}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">Messages — 7 hari</h3>
            <Link href="/dashboard/analytics" className="text-[11px] font-semibold text-cyan-400 hover:underline">
              Analytics →
            </Link>
          </div>
          <MiniBars data={data.charts.messages7d} />
        </div>
        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">API Requests — 7 hari</h3>
            <Link href="/dashboard/api-keys" className="text-[11px] font-semibold text-cyan-400 hover:underline">
              API Keys →
            </Link>
          </div>
          <MiniLine data={data.charts.api7d} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* bot activity */}
        <div className="card p-5">
          <h3 className="mb-4 text-sm font-bold text-white">Bot Activity</h3>
          <div className="space-y-3">
            {(
              [
                ["online", "Online", "text-emerald-400", "bg-emerald-400"],
                ["offline", "Offline", "text-slate-400", "bg-slate-500"],
                ["other", "Connecting/Error", "text-amber-400", "bg-amber-400"],
              ] as const
            ).map(([k, label, text, dot]) => (
              <div key={k}>
                <div className="flex justify-between text-xs">
                  <span className="flex items-center gap-2 text-slate-400">
                    <span className={`h-2 w-2 rounded-full ${dot}`} />
                    {label}
                  </span>
                  <span className={`font-bold ${text}`}>{data.charts.botStatus[k]}</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/5">
                  <div
                    className={`h-full rounded-full ${dot} transition-all duration-700`}
                    style={{
                      width: `${
                        data.stats.totalBots
                          ? (data.charts.botStatus[k] / data.stats.totalBots) * 100
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 border-t border-white/5 pt-4">
            <h4 className="mb-2 text-xs font-bold text-white">Connection Status</h4>
            {data.charts.connections.length === 0 && (
              <p className="text-[11px] text-slate-600">Belum ada sesi WhatsApp.</p>
            )}
            {data.charts.connections.map((c) => (
              <div key={c.botId} className="flex items-center justify-between py-1.5">
                <div className="min-w-0">
                  <p className="truncate text-[11px] text-slate-400">
                    {c.phoneNumber ?? c.botId.slice(0, 8)}
                  </p>
                </div>
                <StatusPill status={c.status} />
              </div>
            ))}
          </div>
        </div>

        {/* announcements */}
        <div className="card p-5">
          <h3 className="mb-4 text-sm font-bold text-white">Announcements</h3>
          {data.announcements.length === 0 && (
            <p className="text-[11px] text-slate-600">Belum ada pengumuman.</p>
          )}
          <div className="space-y-3">
            {data.announcements.map((a) => (
              <div key={a.id} className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-200">{a.title}</p>
                  <Badge
                    tone={
                      a.type === "warning" ? "amber" : a.type === "maintenance" ? "red" : a.type === "update" ? "cyan" : "slate"
                    }
                  >
                    {a.type.toUpperCase()}
                  </Badge>
                </div>
                <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">{a.content}</p>
              </div>
            ))}
          </div>
        </div>

        {/* recent logs */}
        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">Recent Logs</h3>
            <Link href="/dashboard/logs" className="text-[11px] font-semibold text-cyan-400 hover:underline">
              Semua →
            </Link>
          </div>
          {data.recentLogs.length === 0 ? (
            <EmptyState title="Belum ada log" desc="Aktivitas bot dan API akan muncul di sini." />
          ) : (
            <div className="space-y-2.5">
              {data.recentLogs.map((l) => (
                <div key={l.id} className="flex items-start gap-2.5">
                  <span
                    className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                      l.level === "error"
                        ? "bg-red-400"
                        : l.level === "warning"
                          ? "bg-amber-400"
                          : l.level === "success"
                            ? "bg-emerald-400"
                            : l.level === "api"
                              ? "bg-blue-400"
                              : "bg-slate-500"
                    }`}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-[11px] text-slate-300">{l.message}</p>
                    <p className="text-[10px] text-slate-600">
                      {l.event} · {timeAgo(l.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
