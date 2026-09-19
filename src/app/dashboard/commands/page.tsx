"use client";

import { useEffect, useState } from "react";
import {
  api,
  useApi,
  Icon,
  Badge,
  Button,
  Modal,
  Field,
  EmptyState,
  ErrorState,
  Spinner,
  toast,
} from "@/components/ui";

type Cmd = {
  id: string;
  name: string;
  description: string;
  category: string;
  enabled: boolean;
  handler: string;
  permissions: string;
  premium: boolean;
  extra: { text?: string };
  runCount: number;
};
type BotLite = { id: string; name: string; prefix: string };

export default function CommandsPage() {
  const { data: bots, loading } = useApi<BotLite[]>("/dashboard/bots");
  const [botId, setBotId] = useState<string | null>(null);
  const activeBot = botId ?? bots?.[0]?.id ?? null;
  const { data, loading: l2, error, reload } = useApi<Cmd[] | null>(
    activeBot ? `/dashboard/commands?botId=${activeBot}` : null,
    [activeBot]
  );
  const [modal, setModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [catFilter, setCatFilter] = useState("all");
  const [copyBusy, setCopyBusy] = useState(false);

  const cats = data
    ? [...new Set(data.map((c) => c.category))].sort()
    : [];
  const visible = data ? (catFilter === "all" ? data : data.filter((c) => c.category === catFilter)) : [];

  const copyMenu = async () => {
    if (!activeBot) return;
    setCopyBusy(true);
    try {
      const d = await api<{ text: string }>(`/dashboard/bots/${activeBot}/menu`);
      await navigator.clipboard.writeText(d.text);
      toast("Menu disalin ke clipboard", "Tempel langsung di WhatsApp untuk membagikan menu.");
    } catch (e: any) {
      toast(e.message ?? "Gagal menyalin menu", undefined, "err");
    } finally {
      setCopyBusy(false);
    }
  };
  const [form, setForm] = useState({
    name: "",
    description: "",
    category: "general",
    handler: "text",
    permissions: "all",
    text: "",
  });

  const prefix = activeBot ? bots?.find((b) => b.id === activeBot)?.prefix ?? "!" : "!";

  const create = async () => {
    setBusy(true);
    try {
      await api("/dashboard/commands", "POST", { botId: activeBot, ...form });
      toast(`Command ${prefix}${form.name} dibuat`);
      setModal(false);
      setForm({ name: "", description: "", category: "general", handler: "text", permissions: "all", text: "" });
      reload();
    } catch (e: any) {
      toast(e.message, undefined, "err");
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (c: Cmd) => {
    try {
      await api(`/dashboard/commands/${c.id}/toggle`, "POST");
      reload();
    } catch (e: any) {
      toast(e.message, undefined, "err");
    }
  };

  const del = async (c: Cmd) => {
    try {
      await api(`/dashboard/commands/${c.id}`, "DELETE");
      toast("Command dihapus");
      reload();
    } catch (e: any) {
      toast(e.message, undefined, "err");
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-white">Command Manager</h2>
          <p className="text-xs text-slate-500">
            Prefix bot: <b className="font-mono text-cyan-300">{prefix}</b> — contoh: {prefix}menu
          </p>
        </div>
        <div className="flex gap-2">
          {activeBot && (
            <Button variant="ghost" loading={copyBusy} onClick={copyMenu} title="Salin menu asli bot via Clipboard API">
              📋 Salin Menu
            </Button>
          )}
          {activeBot && (
            <Button onClick={() => setModal(true)}>
              <Icon name="plus" size={14} /> Create Command
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-start gap-2.5 rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-[11px] leading-relaxed text-cyan-200">
        <Icon name="bolt" size={14} className="mt-0.5 shrink-0" />
        <p>
          Command dieksekusi <b>bot engine</b> setiap ada pesan masuk dari WhatsApp (private & grup)
          sesuai prefix & permission. Cara tes: hubungkan WhatsApp di menu <b>WhatsApp</b>, lalu kirim{" "}
          <code className="font-mono text-cyan-300">{prefix}menu</code> ke bot Anda. Kolom{" "}
          <b>Runs</b> bertambah <b>nyata</b> setiap command berjalan.
        </p>
      </div>

      {bots && bots.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {bots.map((b) => (
            <button
              key={b.id}
              onClick={() => setBotId(b.id)}
              className={`shrink-0 rounded-xl border px-4 py-2 text-xs font-semibold transition ${
                activeBot === b.id
                  ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-300"
                  : "border-white/10 bg-white/[0.02] text-slate-400"
              }`}
            >
              {b.name}
            </button>
          ))}
        </div>
      )}

      {data && data.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          <button
            onClick={() => setCatFilter("all")}
            className={`shrink-0 rounded-full border px-3 py-1 text-[10px] font-bold transition ${
              catFilter === "all" ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-300" : "border-white/10 text-slate-500"
            }`}
          >
            ALL ({data.length})
          </button>
          {cats.map((c) => (
            <button
              key={c}
              onClick={() => setCatFilter(c)}
              className={`shrink-0 rounded-full border px-3 py-1 text-[10px] font-bold transition ${
                catFilter === c ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-300" : "border-white/10 text-slate-500"
              }`}
            >
              {c.toUpperCase()} ({data.filter((x) => x.category === c).length})
            </button>
          ))}
        </div>
      )}

      {loading || (l2 && !data) ? (
        <div className="flex flex-col items-center gap-3 py-16 text-slate-500">
          <Spinner size={22} />
          <p className="text-xs">Loading...</p>
        </div>
      ) : error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !activeBot || !data || visible.length === 0 ? (
        <EmptyState
          icon={<Icon name="code" size={30} />}
          title="No commands found"
          desc="Buat command pertama untuk bot ini."
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/5 text-[10px] uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3">Command</th>
                <th className="hidden px-4 py-3 sm:table-cell">Description</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Handler</th>
                <th className="hidden px-4 py-3 md:table-cell">Permission</th>
                <th className="px-4 py-3">Runs</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => (
                <tr key={c.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="px-4 py-3 font-mono font-semibold text-cyan-300">
                    {prefix}
                    {c.name}
                    {c.premium && <span className="ml-1.5 rounded bg-violet-500/15 px-1 py-0.5 text-[8px] font-bold text-violet-300 align-middle">PREMIUM</span>}
                  </td>
                  <td className="hidden max-w-52 truncate px-4 py-3 text-slate-400 sm:table-cell">{c.description}</td>
                  <td className="px-4 py-3">
                    <Badge>{c.category}</Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-400">{c.handler}</td>
                  <td className="hidden px-4 py-3 text-slate-500 md:table-cell">{c.permissions}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold tabular-nums ${c.runCount > 0 ? "bg-emerald-500/10 text-emerald-300" : "bg-white/5 text-slate-500"}`}>
                      {c.runCount}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggle(c)}
                      className={`relative h-5 w-9 rounded-full transition ${c.enabled ? "bg-cyan-500/70" : "bg-slate-700"}`}
                      aria-label="Toggle"
                    >
                      <span
                        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${c.enabled ? "left-4.5" : "left-0.5"}`}
                        style={{ left: c.enabled ? 18 : 2 }}
                      />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => del(c)} className="rounded-lg p-1.5 text-slate-500 transition hover:bg-red-500/10 hover:text-red-400">
                      <Icon name="trash" size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title="Create Command">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name" hint={`Dipakai sebagai ${prefix}name`}>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })} placeholder="cek_harga" />
            </Field>
            <Field label="Category">
              <input className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="general" />
            </Field>
          </div>
          <Field label="Description">
            <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Handler">
              <select className="input" value={form.handler} onChange={(e) => setForm({ ...form, handler: e.target.value })}>
                <option value="text">text (custom reply)</option>
                <option value="menu">menu</option>
                <option value="help">help</option>
                <option value="ping">ping</option>
                <option value="owner">owner</option>
                <option value="runtime">runtime</option>
                <option value="status">status</option>
                <option value="info">info</option>
              </select>
            </Field>
            <Field label="Permission">
              <select className="input" value={form.permissions} onChange={(e) => setForm({ ...form, permissions: e.target.value })}>
                <option value="all">all</option>
                <option value="admin">admin (group)</option>
                <option value="owner">owner only</option>
              </select>
            </Field>
          </div>
          {form.handler === "text" && (
            <Field label="Reply Text" hint="Placeholder {user} = nama pengirim.">
              <textarea className="input min-h-20" value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} />
            </Field>
          )}
          <Button className="w-full" loading={busy} onClick={create}>
            Simpan Command
          </Button>
        </div>
      </Modal>
    </div>
  );
}
