"use client";

import { useState } from "react";
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
  CopyBtn,
  toast,
  fmtDate,
  timeAgo,
} from "@/components/ui";

type Key = {
  id: string;
  name: string;
  keyPrefix: string;
  permissions: string[];
  ipWhitelist: string | null;
  lastUsedAt: string | null;
  requestCount: number;
  revokedAt: string | null;
  createdAt: string;
  botId: string | null;
};

const PERMS = [
  { id: "messages.send", desc: "Kirim pesan" },
  { id: "messages.read", desc: "Baca pesan" },
  { id: "bots.read", desc: "Lihat bot & status" },
  { id: "bots.manage", desc: "Buat/hapus bot" },
  { id: "webhooks.manage", desc: "Kelola webhook" },
];

export default function ApiKeysPage() {
  const { data: bots } = useApi<{ id: string; name: string }[]>("/dashboard/bots");
  const { data, loading, error, reload } = useApi<Key[]>("/dashboard/api-keys");
  const [modal, setModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", botId: "", ipWhitelist: "" });
  const [perms, setPerms] = useState<string[]>(["bots.read"]);
  const [freshKey, setFreshKey] = useState<{ name: string; key: string } | null>(null);
  const [renameTarget, setRenameTarget] = useState<Key | null>(null);
  const [newKey, setNewKey] = useState("");

  const create = async () => {
    setBusy(true);
    try {
      const d = await api<{ name: string; key: string }>("/dashboard/api-keys", "POST", {
        name: form.name,
        botId: form.botId || undefined,
        ipWhitelist: form.ipWhitelist || undefined,
        permissions: perms,
      });
      setModal(false);
      setFreshKey({ name: d.name, key: d.key });
      setForm({ name: "", botId: "", ipWhitelist: "" });
      reload();
    } catch (e: any) {
      toast(e.message, undefined, "err");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (k: Key) => {
    try {
      await api(`/dashboard/api-keys/${k.id}/revoke`, "POST");
      toast("API key dicabut");
      reload();
    } catch (e: any) {
      toast(e.message, undefined, "err");
    }
  };

  const del = async (k: Key) => {
    try {
      await api(`/dashboard/api-keys/${k.id}`, "DELETE");
      toast("API key dihapus");
      reload();
    } catch (e: any) {
      toast(e.message, undefined, "err");
    }
  };

  const saveRename = async () => {
    if (!renameTarget || !newKey.trim()) return;
    try {
      await api(`/dashboard/api-keys/${renameTarget.id}/rename`, "POST", { name: newKey });
      toast("Nama diperbarui");
      setRenameTarget(null);
      reload();
    } catch (e: any) {
      toast(e.message, undefined, "err");
    }
  };

  if (loading && !data)
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-slate-500">
        <Spinner size={22} />
        <p className="text-xs">Memuat API keys...</p>
      </div>
    );
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-white">API Keys</h2>
          <p className="text-xs text-slate-500">
            Database hanya menyimpan <b>hash</b> key. Key penuh hanya ditampilkan sekali.
          </p>
        </div>
        <Button onClick={() => setModal(true)}>
          <Icon name="plus" size={14} /> Create API Key
        </Button>
      </div>

      {/* fresh key display */}
      {freshKey && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5">
          <div className="mb-2 flex items-center gap-2 text-emerald-300">
            <Icon name="check" size={16} />
            <p className="text-xs font-bold">API key "{freshKey.name}" berhasil dibuat</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="flex-1 break-all rounded-xl bg-ink-950 px-4 py-3 font-mono text-xs text-emerald-300">
              {freshKey.key}
            </code>
            <CopyBtn text={freshKey.key} />
          </div>
          <p className="mt-3 text-[11px] text-amber-300/80">
            ⚠ Simpan sekarang — key tidak akan ditampilkan lagi.
          </p>
        </div>
      )}

      {data && data.length === 0 ? (
        <EmptyState
          icon={<Icon name="key" size={30} />}
          title="Belum ada API key"
          desc='Buat key pertama untuk memanggil REST API (Authorization: Bearer WAC_...).'
          action={
            <Button onClick={() => setModal(true)}>
              <Icon name="plus" size={14} /> Create API Key
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {(data ?? []).map((k) => (
            <div key={k.id} className="card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-white">{k.name}</p>
                    {k.revokedAt && <Badge tone="red">REVOKED</Badge>}
                  </div>
                  <p className="mt-0.5 font-mono text-[11px] text-slate-500">
                    {k.keyPrefix}{"•".repeat(8)}
                  </p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => { setNewKey(k.name); setRenameTarget(k); }} className="rounded-lg p-1.5 text-slate-500 hover:bg-white/5 hover:text-white" title="Rename">
                    <Icon name="edit" size={14} />
                  </button>
                  {!k.revokedAt && (
                    <button onClick={() => revoke(k)} className="rounded-lg p-1.5 text-slate-500 hover:bg-amber-500/10 hover:text-amber-400" title="Revoke">
                      <Icon name="stop" size={14} />
                    </button>
                  )}
                  <button onClick={() => del(k)} className="rounded-lg p-1.5 text-slate-500 hover:bg-red-500/10 hover:text-red-400" title="Delete">
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {k.permissions.map((p) => (
                  <Badge key={p} tone="cyan">{p}</Badge>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/5 pt-3 text-[11px] text-slate-500">
                <p>Request: <b className="text-slate-300">{k.requestCount.toLocaleString()}</b></p>
                <p>Last used: <b className="text-slate-300">{k.lastUsedAt ? timeAgo(k.lastUsedAt) : "belum pernah"}</b></p>
                <p>Created: {fmtDate(k.createdAt)}</p>
                <p>IP whitelist: {k.ipWhitelist ? <span className="font-mono">{k.ipWhitelist}</span> : "—"}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title="Create API Key">
        <div className="space-y-4">
          <Field label="Name">
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="production-key" />
          </Field>
          <Field label="Scope Bot (opsional)">
            <select className="input" value={form.botId} onChange={(e) => setForm({ ...form, botId: e.target.value })}>
              <option value="">Semua bot saya</option>
              {(bots ?? []).map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Permissions">
            <div className="space-y-1.5">
              {PERMS.map((p) => (
                <label key={p.id} className="flex cursor-pointer items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                  <span className="text-xs text-slate-300">
                    <code className="text-cyan-300">{p.id}</code>
                    <span className="ml-2 text-slate-500">{p.desc}</span>
                  </span>
                  <input
                    type="checkbox"
                    className="accent-cyan-500"
                    checked={perms.includes(p.id)}
                    onChange={(e) =>
                      setPerms((prev) => (e.target.checked ? [...prev, p.id] : prev.filter((x) => x !== p.id)))
                    }
                  />
                </label>
              ))}
            </div>
          </Field>
          <Field label="IP Whitelist (opsional)" hint="Pisahkan dengan koma. Kosong = semua IP.">
            <input className="input" value={form.ipWhitelist} onChange={(e) => setForm({ ...form, ipWhitelist: e.target.value })} placeholder="1.2.3.4, 5.6.7.8" />
          </Field>
          <Button className="w-full" loading={busy} onClick={create}>
            Generate Key
          </Button>
        </div>
      </Modal>

      <Modal open={!!renameTarget} onClose={() => setRenameTarget(null)} title="Rename API Key">
        <div className="space-y-4">
          <Field label="Nama Baru">
            <input className="input" value={newKey} onChange={(e) => setNewKey(e.target.value)} />
          </Field>
          <Button className="w-full" onClick={saveRename}>Simpan</Button>
        </div>
      </Modal>
    </div>
  );
}
