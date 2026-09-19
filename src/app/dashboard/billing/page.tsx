"use client";

import Link from "next/link";
import { useState } from "react";
import {
  api,
  useApi,
  Icon,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Spinner,
  toast,
  fmtDate,
} from "@/components/ui";
import type { Plan } from "@/components/landing";

type Billing = {
  plan: string;
  planName: string;
  subscription: { status: string; expiresAt: string | null } | null;
  usage: { bots: number; botLimit: number; messages: number; apiRequests: number };
  payments: {
    id: string;
    plan: string;
    amount: number;
    method: string;
    status: string;
    reference: string;
    createdAt: string;
  }[];
  plans: Plan[];
};

export default function BillingPage() {
  const { data, loading, error, reload } = useApi<Billing>("/dashboard/billing");
  const [busy, setBusy] = useState<string | null>(null);

  const upgrade = async (planId: string) => {
    setBusy(planId);
    try {
      const d = await api<{ note: string }>("/dashboard/billing/upgrade", "POST", { plan: planId });
      toast("Permintaan upgrade dibuat", d.note, "ok");
      reload();
    } catch (e: any) {
      toast(e.message, undefined, "err");
    } finally {
      setBusy(null);
    }
  };

  if (loading && !data)
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-slate-500">
        <Spinner size={22} />
        <p className="text-xs">Memuat billing...</p>
      </div>
    );
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  const pct = Math.min(100, Math.round((data.usage.bots / Math.max(1, data.usage.botLimit)) * 100));

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-lg font-bold text-white">Billing</h2>
        <p className="text-xs text-slate-500">Plan, penggunaan, dan invoice. Pembayaran diverifikasi oleh admin (server-side).</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* current plan */}
        <div className="card glow-ring p-5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Current Plan</p>
          <p className="mt-1 font-display text-3xl font-bold text-gradient">{data.planName}</p>
          <div className="mt-3 flex items-center gap-2">
            <Badge tone={data.subscription?.status === "active" ? "green" : "slate"}>
              {(data.subscription?.status ?? "active").toUpperCase()}
            </Badge>
            <span className="text-[11px] text-slate-500">
              {data.subscription?.expiresAt
                ? `Berakhir ${fmtDate(data.subscription.expiresAt)}`
                : "Berlangsung terus"}
            </span>
          </div>
          <div className="mt-5">
            <div className="flex justify-between text-[11px] text-slate-500">
              <span>Bot: {data.usage.bots}/{data.usage.botLimit}</span>
              <span>{pct}%</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/5">
              <div
                className={`h-full rounded-full transition-all duration-700 ${pct >= 100 ? "bg-amber-400" : "bg-gradient-to-r from-cyan-400 to-blue-500"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] text-slate-500">
            <p className="rounded-lg bg-white/[0.03] px-3 py-2">Messages total: <b className="text-slate-300">{data.usage.messages.toLocaleString()}</b></p>
            <p className="rounded-lg bg-white/[0.03] px-3 py-2">API requests: <b className="text-slate-300">{data.usage.apiRequests.toLocaleString()}</b></p>
          </div>
        </div>

        {/* invoices */}
        <div className="card p-5 lg:col-span-2">
          <h3 className="mb-4 text-sm font-bold text-white">Invoices</h3>
          {data.payments.length === 0 ? (
            <EmptyState
              icon={<Icon name="card" size={28} />}
              title="Belum ada invoice"
              desc="Upgrade plan Anda dan pembayaran akan tercatat di sini."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/5 text-[10px] uppercase tracking-wider text-slate-500">
                    <th className="px-3 py-2">Reference</th>
                    <th className="px-3 py-2">Plan</th>
                    <th className="px-3 py-2">Amount</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {data.payments.map((p) => (
                    <tr key={p.id} className="border-b border-white/5">
                      <td className="px-3 py-2.5 font-mono text-[11px] text-slate-400">{p.reference}</td>
                      <td className="px-3 py-2.5 font-semibold text-white">{p.plan.toUpperCase()}</td>
                      <td className="px-3 py-2.5 text-slate-400">Rp{p.amount.toLocaleString("id-ID")}</td>
                      <td className="px-3 py-2.5">
                        <Badge tone={p.status === "success" ? "green" : p.status === "failed" ? "red" : "amber"}>
                          {p.status.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5 text-slate-500">{fmtDate(p.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* upgrade */}
      <div>
        <h3 className="mb-3 text-sm font-bold text-white">Upgrade / Downgrade</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {data.plans
            .filter((p) => p.id !== "enterprise" && p.id !== data.plan.toLowerCase())
            .map((p) => (
              <div key={p.id} className={`card card-hover flex flex-col p-4 ${p.featured ? "glow-ring" : ""}`}>
                <p className="font-display text-xs font-bold text-white">{p.name}</p>
                <p className="mt-1 font-display text-xl font-bold text-cyan-300">
                  Rp{p.price.toLocaleString("id-ID")}
                  <span className="ml-1 text-[10px] font-normal text-slate-500">/bulan</span>
                </p>
                <p className="mt-1 text-[11px] text-slate-500">{p.botLimit} bot · {p.features[0]}</p>
                <Button
                  variant={p.featured ? "primary" : "ghost"}
                  className="mt-3 !py-2 !text-xs"
                  loading={busy === p.id}
                  onClick={() => upgrade(p.id)}
                >
                  {Number(p.price) > Number(data.plans.find((x) => x.id === data.plan.toLowerCase())?.price ?? 0) ? "Upgrade" : "Downgrade"}
                </Button>
              </div>
            ))}
        </div>
        <div className="card mt-3 flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="text-xs font-bold text-white">ENTERPRISE</p>
            <p className="text-[11px] text-slate-500">Custom bot limit, dedicated resources, premium support.</p>
          </div>
          <Link href="/dashboard/support" className="btn btn-ghost !py-2 !text-xs">
            <Icon name="headset" size={13} /> Hubungi Sales
          </Link>
        </div>
      </div>
    </div>
  );
}
