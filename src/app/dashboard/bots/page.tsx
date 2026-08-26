"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
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
  StatusPill,
  toast,
  fmtDate,
  fmtUptime,
  timeAgo,
} from "@/components/ui";

type Bot = {
  id: string;
  name: string;
  status: string;
  prefix: string;
  ownerNumber: string | null;
  description: string | null;
  whatsappNumber: string | null;
  uptimeSec: number;
  messagesSent: number;
  messagesReceived: number;
  createdAt: string;
  lastActivityAt: string | null;
  engine: boolean;
  wa: { status: string; phoneNumber: string | null; lastConnectedAt: string | null } | null;
  settings?: { menuPhotoUrl?: string };
};

function BotsInner() {
  const params = useSearchParams();
  const { data: bots, loading, error, reload } = useApi<Bot[]>("/dashboard/bots");
  const [createOpen, setCreateOpen] = useState(params.get("new") === "1");
  const [confirmDel, setConfirmDel] = useState<Bot | null>(null);
  const [renaming, setRenaming] = useState<Bot | null>(null);
  const [configuring, setConfiguring] = useState<Bot | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [form, setForm] = useState({ name: "", prefix: "!", ownerNumber: "", description: "" });
  const [newName, setNewName] = useState("");
  const [cfg, setCfg] = useState({ prefix: "!", ownerNumber: "", description: "", menuPhotoUrl: "" });

  useEffect(() => {
    const fn = () => reload();
    window.addEventListener("wac:refresh", fn);
    return () => window.removeEventListener("wac:refresh", fn);
  }, [reload]);

  const act = async (b: Bot, action: string) => {
    setBusy(`${b.id}:${action}`);
    try {
      await api(`/dashboard/bots/${b.id}/${action}`, "POST");
      toast(`${b.name}: ${action} diproses`);
      setTimeout(reload, 800);
    } catch (e: any) {
      toast(e.message, undefined, "err");
    } finally {
      setBusy(null);
    }
  };

  const createBot = async () => {
    setBusy("create");
    try {
      await api("/dashboard/bots", "POST", form);
      toast("Bot dibuat", "Start bot lalu hubungkan WhatsApp di halaman WhatsApp.");
      setCreateOpen(false);
      setForm({ name: "", prefix: "!", ownerNumber: "", description: "" });
      reload();
    } catch (e: any) {
      toast(e.message, undefined, "err");
      setBusy(null);
    }
  };

  const removeBot = async () => {
    if (!confirmDel) return;
    setBusy("delete");
    try {
      await api(`/dashboard/bots/${confirmDel.id}`, "DELETE");
      toast("Bot dihapus");
      setConfirmDel(null);
      reload();
    } catch (e: any) {
      toast(e.message, undefined, "err");
    } finally {
      setBusy(null);
    }
  };

  const saveRename = async () => {
    if (!renaming || !newName.trim()) return;
    setBusy("rename");
    try {
      await api(`/dashboard/bots/${renaming.id}/update`, "POST", { name: newName });
      toast("Nama bot diperbarui");
      setRenaming(null);
      reload();
    } catch (e: any) {
      toast(e.message, undefined, "err");
    } finally {
      setBusy(null);
    }
  };

  const openConfig = (b: Bot) => {
    setCfg({ prefix: b.prefix, ownerNumber: b.ownerNumber ?? "", description: b.description ?? "", menuPhotoUrl: b.settings?.menuPhotoUrl ?? "" });
    setConfiguring(b);
  };

  const saveConfig = async () => {
    if (!configuring) return;
    setBusy("config");
    try {
      await api(`/dashboard/bots/${configuring.id}/update`, "POST", { prefix: cfg.prefix, ownerNumber: cfg.ownerNumber, description: cfg.description, settings: { menuPhotoUrl: cfg.menuPhotoUrl } });
      toast("Konfigurasi disimpan");
      setConfiguring(null);
      reload();
    } catch (e: any) {
      toast(e.message, undefined, "err");
    } finally {
      setBusy(null);
    }
  };

  if (loading && !bots)
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-slate-500">
        <Spinner size={22} />
        <p className="text-xs">Memuat bot...</p>
      </div>
    );
  if (error && !bots) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-white">My Bots</h2>
          <p className="text-xs text-slate-500">
            {bots?.length ?? 0} bot · setiap bot punya sesi WhatsApp terisolasi
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Icon name="plus" size={14} />
          Create Bot
        </Button>
      </div>

      {bots && bots.length === 0 ? (
        <EmptyState
          icon={<Icon name="bot" size={30} />}
          title="No bots found"
          desc="Buat bot pertama Anda, lalu hubungkan WhatsApp lewat QR atau pairing code."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Icon name="plus" size={14} /> Buat Bot Pertama
            </Button>
          }
        />
      ) : (
        <>
          {/* desktop table */}
          <div className="card hidden overflow-x-auto md:block">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/5 text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3">Bot</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">WhatsApp</th>
                  <th className="px-4 py-3">Uptime</th>
                  <th className="px-4 py-3">Messages</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3">Last Activity</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(bots ?? []).map((b) => (
                  <tr key={b.id} className="border-b border-white/5 transition hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-white">
                        {b.prefix}
                        {b.name}
                      </p>
                      <p className="font-mono text-[10px] text-slate-600">{b.id.slice(0, 8)}…</p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={b.status} />
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {b.whatsappNumber ? `+${b.whatsappNumber}` : <span className="text-slate-600">belum terhubung</span>}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-400">{fmtUptime(b.status === "online" ? b.uptimeSec : 0)}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-400">
                      ↑{b.messagesSent.toLocaleString()} ↓{b.messagesReceived.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{fmtDate(b.createdAt)}</td>
                    <td className="px-4 py-3 text-slate-500">{b.lastActivityAt ? timeAgo(b.lastActivityAt) : "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {b.status === "online" || b.status === "connecting" || b.status === "reconnecting" ? (
                          <>
                            <IconBtn title="Stop" icon="stop" busy={busy === `${b.id}:stop`} onClick={() => act(b, "stop")} tone="red" />
                            <IconBtn title="Restart" icon="refresh" busy={busy === `${b.id}:restart`} onClick={() => act(b, "restart")} />
                          </>
                        ) : (
                          <IconBtn title="Start" icon="play" busy={busy === `${b.id}:start`} onClick={() => act(b, "start")} tone="green" />
                        )}
                        <IconBtn title="Reconnect" icon="wifi" busy={busy === `${b.id}:reconnect`} onClick={() => act(b, "reconnect")} />
                        <IconBtn title="Rename" icon="edit" onClick={() => { setNewName(b.name); setRenaming(b); }} />
                        <IconBtn title="Settings" icon="gear" onClick={() => openConfig(b)} />
                        <IconBtn title="Delete" icon="trash" onClick={() => setConfirmDel(b)} tone="red" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* mobile cards */}
          <div className="space-y-3 md:hidden">
            {(bots ?? []).map((b) => (
              <div key={b.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-display text-sm font-bold text-white">
                      {b.prefix}
                      {b.name}
                    </p>
                    <p className="font-mono text-[10px] text-slate-600">{b.id.slice(0, 8)}…</p>
                  </div>
                  <StatusPill status={b.status} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-400">
                  <p>WA: {b.whatsappNumber ? `+${b.whatsappNumber}` : "—"}</p>
                  <p>Uptime: {fmtUptime(b.status === "online" ? b.uptimeSec : 0)}</p>
                  <p>↑{b.messagesSent} ↓{b.messagesReceived}</p>
                  <p>Created {fmtDate(b.createdAt)}</p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 border-t border-white/5 pt-3">
                  {b.status === "online" || b.status === "connecting" || b.status === "reconnecting" ? (
                    <>
                      <Button variant="danger" className="!px-3 !py-1.5 !text-[11px]" loading={busy === `${b.id}:stop`} onClick={() => act(b, "stop")}>Stop</Button>
                      <Button variant="ghost" className="!px-3 !py-1.5 !text-[11px]" loading={busy === `${b.id}:restart`} onClick={() => act(b, "restart")}>Restart</Button>
                    </>
                  ) : (
                    <Button className="!px-3 !py-1.5 !text-[11px]" loading={busy === `${b.id}:start`} onClick={() => act(b, "start")}>Start</Button>
                  )}
                  <Button variant="ghost" className="!px-3 !py-1.5 !text-[11px]" loading={busy === `${b.id}:reconnect`} onClick={() => act(b, "reconnect")}>Reconnect</Button>
                  <Button variant="ghost" className="!px-3 !py-1.5 !text-[11px]" onClick={() => { setNewName(b.name); setRenaming(b); }}>Rename</Button>
                  <Button variant="ghost" className="!px-3 !py-1.5 !text-[11px]" onClick={() => openConfig(b)}>Settings</Button>
                  <Button variant="danger" className="!px-3 !py-1.5 !text-[11px]" onClick={() => setConfirmDel(b)}>Hapus</Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* create modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Bot">
        <div className="space-y-4">
          <Field label="Bot Name">
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="waterbot-01" maxLength={64} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Runtime">
              <select className="input" value="node" disabled>
                <option value="node">Node.js (Baileys)</option>
              </select>
            </Field>
            <Field label="Prefix">
              <input className="input" value={form.prefix} onChange={(e) => setForm({ ...form, prefix: e.target.value })} maxLength={4} placeholder="!" />
            </Field>
          </div>
          <Field label="Owner Number" hint="Nomor WhatsApp owner (format 62xxx).">
            <input className="input" value={form.ownerNumber} onChange={(e) => setForm({ ...form, ownerNumber: e.target.value })} placeholder="6281234567890" />
          </Field>
          <Field label="Description">
            <textarea className="input min-h-16" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Deskripsi singkat (opsional)" />
          </Field>
          <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-2.5 text-[11px] text-cyan-200">
            Command default (menu, help, ping, owner, runtime, status, info) akan dibuat otomatis.
          </div>
          <Button className="w-full !py-2.5" loading={busy === "create"} onClick={createBot}>
            Buat Bot
          </Button>
        </div>
      </Modal>

      {/* delete confirm */}
      <Modal open={!!confirmDel} onClose={() => setConfirmDel(null)} title="Hapus Bot?">
        <p className="text-xs leading-relaxed text-slate-400">
          Bot <b className="text-white">{confirmDel?.name}</b> akan dihapus beserta command,
          automation, dan sesi WhatsApp-nya. Tindakan ini tidak bisa dibatalkan.
        </p>
        <div className="mt-5 flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={() => setConfirmDel(null)}>
            Batal
          </Button>
          <Button variant="danger" className="flex-1" loading={busy === "delete"} onClick={removeBot}>
            Hapus
          </Button>
        </div>
      </Modal>

      {/* rename */}
      <Modal open={!!renaming} onClose={() => setRenaming(null)} title="Rename Bot">
        <div className="space-y-4">
          <Field label="Nama Baru">
            <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={64} />
          </Field>
          <Button className="w-full" loading={busy === "rename"} onClick={saveRename}>
            Simpan
          </Button>
        </div>
      </Modal>

      {/* config */}
      <Modal open={!!configuring} onClose={() => setConfiguring(null)} title={`Settings — ${configuring?.name ?? ""}`}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Prefix">
              <input className="input" value={cfg.prefix} onChange={(e) => setCfg({ ...cfg, prefix: e.target.value })} maxLength={4} />
            </Field>
            <Field label="Owner Number">
              <input className="input" value={cfg.ownerNumber} onChange={(e) => setCfg({ ...cfg, ownerNumber: e.target.value })} placeholder="62xxx" />
            </Field>
          </div>
          <Field label="Description">
            <textarea className="input min-h-16" value={cfg.description} onChange={(e) => setCfg({ ...cfg, description: e.target.value })} />
          </Field>
          <Field label="Foto Menu (URL HTTPS)">
            <input className="input" value={cfg.menuPhotoUrl} onChange={(e) => setCfg({ ...cfg, menuPhotoUrl: e.target.value })} placeholder="https://contoh.com/menu.jpg" maxLength={2000} />
            <p className="mt-1 text-[10px] text-slate-600">Foto ini akan dikirim sebagai gambar pada .menu dan .allmenu. Kosongkan untuk kembali ke menu teks.</p>
          </Field>
          <div className="rounded-lg bg-white/[0.03] px-3 py-2.5 text-[11px] text-slate-500">
            Bot ID: <span className="font-mono text-slate-400">{configuring?.id}</span>
            <br />
            Status: <Badge tone="slate">{configuring?.status?.toUpperCase()}</Badge>
          </div>
          <Button className="w-full" loading={busy === "config"} onClick={saveConfig}>
            Simpan Perubahan
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function IconBtn({
  title,
  icon,
  onClick,
  tone = "slate",
  busy,
}: {
  title: string;
  icon: string;
  onClick: () => void;
  tone?: "slate" | "red" | "green";
  busy?: boolean;
}) {
  const toneCls =
    tone === "red" ? "hover:text-red-400 hover:bg-red-500/10" : tone === "green" ? "hover:text-emerald-400 hover:bg-emerald-500/10" : "hover:text-cyan-300 hover:bg-cyan-500/10";
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={busy}
      className={`rounded-lg p-1.5 text-slate-500 transition ${toneCls} ${busy ? "opacity-40" : ""}`}
    >
      {busy ? <Spinner size={13} /> : <Icon name={icon} size={14} />}
    </button>
  );
}

export default function BotsPage() {
  return (
    <Suspense fallback={<div className="py-24 text-center text-xs text-slate-500">Loading...</div>}>
      <BotsInner />
    </Suspense>
  );
}
