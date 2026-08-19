"use client";

import { useEffect, useState } from "react";
import {
  api,
  useApi,
  Icon,
  Badge,
  Button,
  Field,
  EmptyState,
  ErrorState,
  Spinner,
  toast,
  fmtDate,
  timeAgo,
} from "@/components/ui";

const TABS = [
  { id: "overview", label: "Overview", icon: "gauge" },
  { id: "users", label: "Users", icon: "user" },
  { id: "bots", label: "Bots", icon: "bot" },
  { id: "payments", label: "Payments", icon: "card" },
  { id: "apikeys", label: "API Keys", icon: "key" },
  { id: "announcements", label: "Announcements", icon: "bell" },
  { id: "tickets", label: "Tickets", icon: "headset" },
  { id: "system", label: "System", icon: "gear" },
];

type Metrics = {
  cpu: { cores: number; loadAvg1: number; usagePct: number };
  memory: { totalGb: number; freeGb: number; usedPct: number; processMb: number };
  disk: { usedPct: number; sizeGb: number } | null;
  uptimeSec: number;
  platform: string;
  node: string;
  db: { poolTotal: number; poolIdle: number; poolWaiting: number };
  sseClients: number;
  engine: { runningBots: number };
  counts: { onlineBots: number; waConnected: number; users: number; webhookFails1h: number };
  system: Record<string, string>;
};

export default function AdminPage() {
  const [tab, setTab] = useState("overview");
  return (
    <div className="space-y-5">
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex shrink-0 items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold transition ${
              tab === t.id ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-300" : "border-white/10 text-slate-400 hover:border-white/20"
            }`}
          >
            <Icon name={t.icon} size={14} />
            {t.label}
          </button>
        ))}
      </div>
      {tab === "overview" && <Overview />}
      {tab === "users" && <Users />}
      {tab === "bots" && <Bots />}
      {tab === "payments" && <Payments />}
      {tab === "apikeys" && <ApiKeys />}
      {tab === "announcements" && <Announcements />}
      {tab === "tickets" && <Tickets />}
      {tab === "system" && <System />}
    </div>
  );
}

/* ------------------------------- Overview ------------------------------- */
function Overview() {
  const { data, loading, error, reload } = useApi<Metrics>("/admin/metrics");
  useEffect(() => {
    const t = setInterval(reload, 10000);
    return () => clearInterval(t);
  }, [reload]);
  if (loading && !data)
    return <div className="flex justify-center py-16"><Spinner size={22} /></div>;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;
  const cards = [
    { label: "CPU Load (1m)", value: data.cpu.loadAvg1.toFixed(2), sub: `${data.cpu.cores} cores · ${data.cpu.usagePct}%` },
    { label: "Memory", value: `${data.memory.totalGb - data.memory.freeGb} / ${data.memory.totalGb} GB`, sub: `${data.memory.usedPct}% used · proc ${data.memory.processMb}MB` },
    { label: "Disk", value: data.disk ? `${data.disk.usedPct}%` : "n/a", sub: data.disk ? `${data.disk.sizeGb} GB total` : "" },
    { label: "Server Uptime", value: `${Math.floor(data.uptimeSec / 3600)}h ${Math.floor((data.uptimeSec % 3600) / 60)}m`, sub: `${data.node} on ${data.platform}` },
    { label: "Active Connections", value: String(data.sseClients), sub: `${data.counts.waConnected} WA sessions` },
    { label: "Bot Engine", value: `${data.engine.runningBots} running`, sub: `${data.counts.onlineBots} online` },
    { label: "Database", value: `${data.db.poolTotal} conns`, sub: `${data.db.poolIdle} idle · ${data.db.poolWaiting} waiting` },
    { label: "Users", value: String(data.counts.users), sub: `${data.counts.webhookFails1h} webhook fails (1h)` },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="card p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{c.label}</p>
            <p className="mt-1.5 font-display text-lg font-bold text-white tabular-nums">{c.value}</p>
            {c.sub && <p className="mt-0.5 text-[10px] text-slate-600">{c.sub}</p>}
          </div>
        ))}
      </div>
      <div className="card p-5">
        <h3 className="mb-3 text-sm font-bold text-white">Service Status</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
          {Object.entries(data.system).map(([k, v]) => (
            <div key={k} className="rounded-xl bg-white/[0.03] px-3 py-2.5 text-center">
              <p className="text-[9px] uppercase tracking-wider text-slate-600">{k}</p>
              <p className={`mt-1 text-[11px] font-bold ${v === "operational" ? "text-emerald-400" : "text-amber-400"}`}>{v}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------- Users --------------------------------- */
type AdminUser = {
  id: string; username: string; email: string; role: string; plan: string;
  suspended: boolean; emailVerified: boolean; createdAt: string; lastLoginAt: string | null;
  subscription: { expiresAt: string | null } | null; botCount: number;
};
function Users() {
  const { data, loading, error, reload } = useApi<AdminUser[]>("/admin/users");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ username: "", email: "", password: "", role: "USER", plan: "FREE" });
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (id: string, path: string, body?: any) => {
    setBusy(id + path);
    try {
      await api(`/admin/users/${id}/${path}`, "POST", body ?? {});
      toast("User diperbarui");
      reload();
    } catch (e: any) {
      toast(e.message, undefined, "err");
    } finally { setBusy(null); }
  };

  const del = async (id: string) => {
    setBusy(id + "del");
    try {
      await api(`/admin/users/${id}/delete`, "POST");
      toast("User dihapus");
      reload();
    } catch (e: any) { toast(e.message, undefined, "err"); } finally { setBusy(null); }
  };

  const create = async () => {
    setBusy("create");
    try {
      await api("/admin/users", "POST", form);
      toast("User dibuat");
      setCreateOpen(false);
      setForm({ username: "", email: "", password: "", role: "USER", plan: "FREE" });
      reload();
    } catch (e: any) { toast(e.message, undefined, "err"); } finally { setBusy(null); }
  };

  if (loading && !data) return <div className="flex justify-center py-16"><Spinner size={22} /></div>;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setCreateOpen(true)}><Icon name="plus" size={14} /> Create User</Button>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-white/5 text-[10px] uppercase tracking-wider text-slate-500">
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Bots</th>
              <th className="hidden px-4 py-3 md:table-cell">Last Login</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((u) => (
              <tr key={u.id} className="border-b border-white/5">
                <td className="px-4 py-3">
                  <p className="font-semibold text-white">{u.username}</p>
                  <p className="text-[10px] text-slate-600">{u.email}</p>
                </td>
                <td className="px-4 py-3">
                  <select className="input !w-24 !px-2 !py-1 !text-[10px]" value={u.role} onChange={(e) => act(u.id, "role", { role: e.target.value })}>
                    <option>USER</option><option>RESELLER</option><option>ADMIN</option>
                  </select>
                </td>
                <td className="px-4 py-3">
                  <select className="input !w-24 !px-2 !py-1 !text-[10px]" value={u.plan} onChange={(e) => act(u.id, "plan", { plan: e.target.value.toLowerCase() })}>
                    <option>FREE</option><option>STARTER</option><option>PRO</option><option>BUSINESS</option><option>ENTERPRISE</option>
                  </select>
                </td>
                <td className="px-4 py-3 tabular-nums text-slate-400">{u.botCount}</td>
                <td className="hidden px-4 py-3 text-slate-500 md:table-cell">{u.lastLoginAt ? timeAgo(u.lastLoginAt) : "—"}</td>
                <td className="px-4 py-3">
                  <button onClick={() => act(u.id, "suspend", { suspended: !u.suspended })} className={`text-[10px] font-bold ${u.suspended ? "text-red-400" : "text-emerald-400"}`}>
                    {u.suspended ? "SUSPENDED" : "ACTIVE"}
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => del(u.id)} disabled={busy === u.id + "del"} className="rounded-lg p-1.5 text-slate-500 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40">
                    <Icon name="trash" size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {createOpen && (
        <div className="card p-5">
          <h3 className="mb-4 text-sm font-bold text-white">Create User</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <input className="input" placeholder="username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            <input className="input" placeholder="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <input className="input" placeholder="password (min 8)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option>USER</option><option>RESELLER</option><option>ADMIN</option>
            </select>
            <select className="input" value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })}>
              <option>FREE</option><option>STARTER</option><option>PRO</option><option>BUSINESS</option><option>ENTERPRISE</option>
            </select>
          </div>
          <Button className="mt-4" loading={busy === "create"} onClick={create}>Buat User</Button>
        </div>
      )}
    </div>
  );
}

/* --------------------------------- Bots ---------------------------------- */
type AdminBot = {
  id: string; name: string; status: string; whatsappNumber: string | null;
  messagesSent: number; messagesReceived: number; uptimeSec: number; username: string; createdAt: string;
};
function Bots() {
  const { data, loading, error, reload } = useApi<AdminBot[]>("/admin/bots");
  const [busy, setBusy] = useState<string | null>(null);
  const act = async (id: string, a: string) => {
    setBusy(id + a);
    try {
      await api(`/admin/bots/${id}/${a}`, "POST");
      toast(`${a} ok`);
      reload();
    } catch (e: any) { toast(e.message, undefined, "err"); } finally { setBusy(null); }
  };
  if (loading && !data) return <div className="flex justify-center py-16"><Spinner size={22} /></div>;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-white/5 text-[10px] uppercase tracking-wider text-slate-500">
            <th className="px-4 py-3">Bot</th>
            <th className="px-4 py-3">Owner</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">WA</th>
            <th className="px-4 py-3">Messages</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {(data ?? []).map((b) => (
            <tr key={b.id} className="border-b border-white/5">
              <td className="px-4 py-3 font-semibold text-white">{b.name}<span className="block font-mono text-[9px] text-slate-600">{b.id.slice(0, 8)}…</span></td>
              <td className="px-4 py-3 text-slate-400">{b.username}</td>
              <td className="px-4 py-3"><Badge tone={b.status === "online" ? "green" : b.status === "error" ? "red" : "slate"}>{b.status.toUpperCase()}</Badge></td>
              <td className="px-4 py-3 text-slate-400">{b.whatsappNumber ? `+${b.whatsappNumber}` : "—"}</td>
              <td className="px-4 py-3 tabular-nums text-slate-400">↑{b.messagesSent} ↓{b.messagesReceived}</td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-1.5">
                  <Button variant="danger" className="!px-2.5 !py-1 !text-[10px]" loading={busy === b.id + "stop"} onClick={() => act(b.id, "stop")}>Stop</Button>
                  <Button variant="ghost" className="!px-2.5 !py-1 !text-[10px]" loading={busy === b.id + "restart"} onClick={() => act(b.id, "restart")}>Restart</Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* -------------------------------- Payments ------------------------------- */
type Pay = { id: string; plan: string; amount: number; method: string; status: string; reference: string; note: string | null; createdAt: string; username: string };
function Payments() {
  const { data, loading, error, reload } = useApi<Pay[]>("/admin/payments");
  const [busy, setBusy] = useState<string | null>(null);
  const act = async (id: string, a: string) => {
    setBusy(id + a);
    try {
      await api(`/admin/payments/${id}/${a}`, "POST");
      toast(a === "verify" ? "Pembayaran diverifikasi — plan user aktif" : "Pembayaran ditandai gagal");
      reload();
    } catch (e: any) { toast(e.message, undefined, "err"); } finally { setBusy(null); }
  };
  if (loading && !data) return <div className="flex justify-center py-16"><Spinner size={22} /></div>;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;
  if (data.length === 0) return <EmptyState title="Belum ada pembayaran" desc="Permintaan upgrade user muncul di sini untuk diverifikasi." />;
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-white/5 text-[10px] uppercase tracking-wider text-slate-500">
            <th className="px-4 py-3">Reference</th>
            <th className="px-4 py-3">User</th>
            <th className="px-4 py-3">Plan</th>
            <th className="px-4 py-3">Amount</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {data.map((p) => (
            <tr key={p.id} className="border-b border-white/5">
              <td className="px-4 py-3 font-mono text-[11px] text-slate-400">{p.reference}</td>
              <td className="px-4 py-3 text-slate-300">{p.username}</td>
              <td className="px-4 py-3 font-semibold text-white">{p.plan.toUpperCase()}</td>
              <td className="px-4 py-3 text-slate-400">Rp{p.amount.toLocaleString("id-ID")}</td>
              <td className="px-4 py-3"><Badge tone={p.status === "success" ? "green" : p.status === "failed" ? "red" : "amber"}>{p.status.toUpperCase()}</Badge></td>
              <td className="px-4 py-3">
                {p.status === "pending" && (
                  <div className="flex justify-end gap-1.5">
                    <Button className="!px-2.5 !py-1 !text-[10px]" loading={busy === p.id + "verify"} onClick={() => act(p.id, "verify")}>Verify</Button>
                    <Button variant="danger" className="!px-2.5 !py-1 !text-[10px]" loading={busy === p.id + "fail"} onClick={() => act(p.id, "fail")}>Fail</Button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* -------------------------------- API Keys ------------------------------- */
type AKey = { id: string; name: string; keyPrefix: string; permissions: string[]; requestCount: number; lastUsedAt: string | null; revokedAt: string | null; createdAt: string; username: string };
function ApiKeys() {
  const { data, loading, error } = useApi<AKey[]>("/admin/api-keys");
  if (loading && !data) return <div className="flex justify-center py-16"><Spinner size={22} /></div>;
  if (error && !data) return <ErrorState message={error} />;
  if (!data) return null;
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-white/5 text-[10px] uppercase tracking-wider text-slate-500">
            <th className="px-4 py-3">Key</th>
            <th className="px-4 py-3">Owner</th>
            <th className="px-4 py-3">Permissions</th>
            <th className="px-4 py-3">Requests</th>
            <th className="px-4 py-3">Last Used</th>
            <th className="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {(data ?? []).map((k) => (
            <tr key={k.id} className="border-b border-white/5">
              <td className="px-4 py-3"><p className="font-semibold text-white">{k.name}</p><p className="font-mono text-[9px] text-slate-600">{k.keyPrefix}••••</p></td>
              <td className="px-4 py-3 text-slate-400">{k.username}</td>
              <td className="px-4 py-3"><div className="flex flex-wrap gap-1">{k.permissions.map((p) => <Badge key={p} tone="cyan">{p}</Badge>)}</div></td>
              <td className="px-4 py-3 tabular-nums text-slate-400">{k.requestCount.toLocaleString()}</td>
              <td className="px-4 py-3 text-slate-500">{k.lastUsedAt ? timeAgo(k.lastUsedAt) : "—"}</td>
              <td className="px-4 py-3">{k.revokedAt ? <Badge tone="red">REVOKED</Badge> : <Badge tone="green">ACTIVE</Badge>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ----------------------------- Announcements ----------------------------- */
type Ann = { id: string; title: string; content: string; type: string; published: boolean; createdAt: string };
function Announcements() {
  const { data, loading, error, reload } = useApi<Ann[]>("/admin/announcements");
  const [form, setForm] = useState({ title: "", content: "", type: "info", published: true });
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    try {
      await api("/admin/announcements", "POST", form);
      toast("Announcement dipublikasikan");
      setForm({ title: "", content: "", type: "info", published: true });
      reload();
    } catch (e: any) { toast(e.message, undefined, "err"); } finally { setBusy(false); }
  };
  const toggle = async (a: Ann) => {
    try {
      await api(`/admin/announcements/${a.id}/publish`, "POST", { published: !a.published });
      reload();
    } catch (e: any) { toast(e.message, undefined, "err"); }
  };
  const del = async (a: Ann) => {
    try {
      await api(`/admin/announcements/${a.id}`, "DELETE");
      toast("Announcement dihapus");
      reload();
    } catch (e: any) { toast(e.message, undefined, "err"); }
  };
  if (loading && !data) return <div className="flex justify-center py-16"><Spinner size={22} /></div>;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  return (
    <div className="space-y-4">
      <div className="card p-5">
        <h3 className="mb-4 text-sm font-bold text-white">Create Announcement</h3>
        <div className="grid gap-3 sm:grid-cols-4">
          <input className="input sm:col-span-2" placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option value="info">INFO</option><option value="update">UPDATE</option><option value="warning">WARNING</option><option value="maintenance">MAINTENANCE</option>
          </select>
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input type="checkbox" className="accent-cyan-500" checked={form.published} onChange={(e) => setForm({ ...form, published: e.target.checked })} />
            Published
          </label>
        </div>
        <textarea className="input mt-3 min-h-16" placeholder="Content" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
        <Button className="mt-3" loading={busy} onClick={create}>Publikasikan</Button>
      </div>
      <div className="space-y-2">
        {(data ?? []).map((a) => (
          <div key={a.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-xs font-bold text-white">{a.title}</p>
                <Badge tone={a.type === "warning" ? "amber" : a.type === "maintenance" ? "red" : a.type === "update" ? "cyan" : "slate"}>{a.type.toUpperCase()}</Badge>
              </div>
              <p className="mt-1 truncate text-[11px] text-slate-500">{a.content}</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => toggle(a)} className={`text-[10px] font-bold ${a.published ? "text-emerald-400" : "text-slate-500"}`}>
                {a.published ? "PUBLISHED" : "DRAFT"}
              </button>
              <button onClick={() => del(a)} className="rounded-lg p-1.5 text-slate-500 hover:bg-red-500/10 hover:text-red-400"><Icon name="trash" size={13} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* --------------------------------- Tickets ------------------------------- */
type ATicket = { id: string; subject: string; status: string; priority: string; createdAt: string; username: string; messages: { id: string; body: string; userId: string | null; createdAt: string }[] };
function Tickets() {
  const { data, loading, error, reload } = useApi<ATicket[]>("/admin/tickets");
  const [open, setOpen] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async (id: string) => {
    if (!reply.trim()) return;
    setBusy(true);
    try {
      await api(`/admin/tickets/${id}/reply`, "POST", { body: reply });
      toast("Jawaban terkirim — user diberi notifikasi");
      setReply("");
      reload();
    } catch (e: any) { toast(e.message, undefined, "err"); } finally { setBusy(false); }
  };
  const close = async (id: string) => {
    try {
      await api(`/admin/tickets/${id}/close`, "POST");
      toast("Ticket ditutup");
      reload();
    } catch (e: any) { toast(e.message, undefined, "err"); }
  };
  if (loading && !data) return <div className="flex justify-center py-16"><Spinner size={22} /></div>;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;
  if (data.length === 0) return <EmptyState title="Belum ada ticket" />;
  return (
    <div className="space-y-2">
      {data.map((t) => (
        <div key={t.id} className="card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <p className="text-xs font-bold text-white">{t.subject}</p>
              <Badge tone={t.status === "closed" ? "slate" : t.status === "answered" ? "green" : "cyan"}>{t.status.toUpperCase()}</Badge>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-slate-500">
              <span>{t.username}</span>·<span>{fmtDate(t.createdAt)}</span>
              <button onClick={() => setOpen(open === t.id ? null : t.id)} className="text-cyan-400 hover:underline">
                {open === t.id ? "Tutup" : "Percakapan"}
              </button>
              {t.status !== "closed" && (
                <button onClick={() => close(t.id)} className="text-red-400 hover:underline">Close</button>
              )}
            </div>
          </div>
          {open === t.id && (
            <div className="mt-3 space-y-2 border-t border-white/5 pt-3">
              {t.messages.map((m) => (
                <div key={m.id} className={`max-w-[90%] rounded-xl px-3 py-2 text-[11px] ${m.userId ? "bg-white/[0.04] text-slate-400" : "bg-cyan-500/10 text-cyan-100"}`}>
                  <p>{m.body}</p>
                  <p className="mt-1 text-[9px] opacity-60">{fmtDate(m.createdAt)}</p>
                </div>
              ))}
              {t.status !== "closed" && (
                <div className="flex gap-2 pt-1">
                  <input className="input flex-1 !py-1.5 !text-[11px]" placeholder="Jawab sebagai admin..." value={reply} onChange={(e) => setReply(e.target.value)} />
                  <Button className="!px-3 !py-1.5 !text-[11px]" loading={busy} onClick={() => send(t.id)}>Kirim</Button>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* --------------------------------- System -------------------------------- */
type Maint = { active: boolean; message: string; eta: string };
function System() {
  const { data: maint, reload: reloadMaint } = useApi<Maint>("/admin/maintenance");
  const { data: pricing, reload: reloadPricing } = useApi<any[]>("/admin/pricing");
  const [form, setForm] = useState<Maint | null>(null);
  const [pricingText, setPricingText] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (maint && !form) setForm(maint);
  }, [maint, form]);
  useEffect(() => {
    if (pricing && pricingText === null) setPricingText(JSON.stringify(pricing, null, 2));
  }, [pricing, pricingText]);

  const saveMaint = async () => {
    if (!form) return;
    setBusy("maint");
    try {
      await api("/admin/maintenance", "POST", form);
      toast(form.active ? "Mode maintenance DIAKTIFKAN" : "Mode maintenance dimatikan");
    } catch (e: any) { toast(e.message, undefined, "err"); } finally { setBusy(null); }
  };

  const savePricing = async () => {
    if (!pricingText) return;
    let parsed: any;
    try {
      parsed = JSON.parse(pricingText);
    } catch {
      toast("JSON pricing tidak valid", undefined, "err");
      return;
    }
    setBusy("pricing");
    try {
      await api("/admin/pricing", "POST", { plans: parsed });
      toast("Pricing diperbarui di seluruh platform");
      reloadPricing();
    } catch (e: any) { toast(e.message, undefined, "err"); } finally { setBusy(null); }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="card p-5">
        <h3 className="mb-1 text-sm font-bold text-white">Maintenance Mode</h3>
        <p className="mb-4 text-[11px] text-slate-500">
          Saat aktif, user non-admin melihat halaman maintenance. Bot tetap berjalan. Admin tetap bisa login.
        </p>
        {form && (
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input type="checkbox" className="accent-cyan-500" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
              <b>{form.active ? "AKTIF" : "Nonaktif"}</b>
            </label>
            <Field label="Maintenance Message">
              <input className="input" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
            </Field>
            <Field label="Estimated Time">
              <input className="input" value={form.eta} onChange={(e) => setForm({ ...form, eta: e.target.value })} placeholder="± 30 menit" />
            </Field>
            <Button loading={busy === "maint"} onClick={saveMaint}>Simpan & Terapkan</Button>
          </div>
        )}
      </div>
      <div className="card p-5">
        <h3 className="mb-1 text-sm font-bold text-white">Pricing Configuration</h3>
        <p className="mb-4 text-[11px] text-slate-500">
          JSON array plan (id, name, price, period, botLimit, featured, cta, features[]). Diterapkan ke seluruh website & limit bot.
        </p>
        {pricingText !== null && (
          <>
            <textarea className="input min-h-64 font-mono !text-[10px] leading-relaxed" value={pricingText} onChange={(e) => setPricingText(e.target.value)} />
            <Button className="mt-3" loading={busy === "pricing"} onClick={savePricing}>Terapkan Pricing</Button>
          </>
        )}
      </div>
    </div>
  );
}
