"use client";

import { useState } from "react";
import {
  useApi,
  Icon,
  Spinner,
  ErrorState,
  MiniBars,
  MiniLine,
  fmtNum,
} from "@/components/ui";

type Analytics = {
  totals: {
    sent: number;
    received: number;
    commands: number;
    api: number;
    webhooks: number;
    errors: number;
    activeUsers: number;
  };
  series: {
    messages: { d: string; n: number }[];
    api: { d: string; n: number }[];
  };
};

const RANGES = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7 Days" },
  { id: "30d", label: "30 Days" },
  { id: "custom", label: "Custom" },
];

export default function AnalyticsPage() {
  const [range, setRange] = useState("7d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const qs = new URLSearchParams();
  qs.set("range", range);
  if (range === "custom") {
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
  }
  const { data, loading, error, reload } = useApi<Analytics>(`/dashboard/analytics?${qs.toString()}`, [range, from, to]);

  const cards = data
    ? [
        { label: "Messages Sent", value: data.totals.sent, icon: "send", tone: "text-cyan-300" },
        { label: "Messages Received", value: data.totals.received, icon: "msg", tone: "text-blue-300" },
        { label: "Commands Executed", value: data.totals.commands, icon: "code", tone: "text-emerald-400" },
        { label: "API Requests", value: data.totals.api, icon: "bolt", tone: "text-amber-300" },
        { label: "Webhook Requests", value: data.totals.webhooks, icon: "hook", tone: "text-violet-300" },
        { label: "Errors", value: data.totals.errors, icon: "alert", tone: "text-red-400" },
        { label: "Active Users", value: data.totals.activeUsers, icon: "user", tone: "text-slate-300" },
      ]
    : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-white">Analytics</h2>
          <p className="text-xs text-slate-500">Data agregat langsung dari database.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-xl border border-white/10 bg-white/[0.02] p-1">
            {RANGES.map((r) => (
              <button
                key={r.id}
                onClick={() => setRange(r.id)}
                className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold transition ${
                  range === r.id ? "bg-cyan-500/15 text-cyan-300" : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          {range === "custom" && (
            <div className="flex items-center gap-1.5">
              <input type="date" className="input w-36 !py-1.5 !text-[11px]" value={from} onChange={(e) => setFrom(e.target.value)} />
              <span className="text-slate-600">→</span>
              <input type="date" className="input w-36 !py-1.5 !text-[11px]" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          )}
        </div>
      </div>

      {loading && !data ? (
        <div className="flex flex-col items-center gap-3 py-20 text-slate-500">
          <Spinner size={22} />
          <p className="text-xs">Menghitung statistik...</p>
        </div>
      ) : error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : data ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
            {cards.map((c) => (
              <div key={c.label} className="card p-3.5">
                <div className="flex items-center gap-1.5 text-slate-600">
                  <Icon name={c.icon} size={12} />
                  <span className="text-[9px] font-semibold uppercase tracking-wider">{c.label}</span>
                </div>
                <p className={`mt-1.5 font-display text-xl font-bold tabular-nums ${c.tone}`}>{fmtNum(c.value)}</p>
              </div>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="card p-5">
              <h3 className="mb-4 text-sm font-bold text-white">Messages per hari</h3>
              <MiniBars data={data.series.messages} />
            </div>
            <div className="card p-5">
              <h3 className="mb-4 text-sm font-bold text-white">API requests per hari</h3>
              <MiniLine data={data.series.api} />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
