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

type Hook = {
  id: string;
  url: string;
  events: string[];
  secret: string;
  enabled: boolean;
  successCount: number;
  failCount: number;
  lastTriggeredAt: string | null;
  createdAt: string;
};

const EVENTS = [
  "message.received",
  "message.sent",
  "message.failed",
  "bot.connected",
  "bot.disconnected",
  "bot.started",
  "bot.stopped",
];

export default function WebhooksPage() {
  const { data, loading, error, reload } = useApi<Hook[]>("/dashboard/webhooks");
  const [modal, setModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ url: "" });
  const [events, setEvents] = useState<string[]>(["message.received"]);
  const [testBusy, setTestBusy] = useState<string | null>(null);

  const create = async () => {
    setBusy(true);
    try {
      await api("/dashboard/webhooks", "POST", { url: form.url, events });
      toast("Webhook dibuat", "Payload JSON ditandatangani HMAC-SHA256 (X-Water-Signature).");
      setModal(false);
      setForm({ url: "" });
      setEvents(["message.received"]);
      reload();
    } catch (e: any) {
      toast(e.message, undefined, "err");
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (h: Hook) => {
    try {
      await api(`/dashboard/webhooks/${h.id}/toggle`, "POST");
      reload();
    } catch (e: any) {
      toast(e.message, undefined, "err");
    }
  };

  const test = async (h: Hook) => {
    setTestBusy(h.id);
    try {
      await api(`/dashboard/webhooks/${h.id}/test`, "POST");
      toast("Event test dikirim", "Retry otomatis: 0s / 1s / 5s. Cek hasil di Logs.");
    } catch (e: any) {
      toast(e.message, undefined, "err");
    } finally {
      setTestBusy(null);
    }
  };

  const del = async (h: Hook) => {
    try {
      await api(`/dashboard/webhooks/${h.id}`, "DELETE");
      toast("Webhook dihapus");
      reload();
    } catch (e: any) {
      toast(e.message, undefined, "err");
    }
  };

  if (loading && !data)
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-slate-500">
        <Spinner size={22} />
        <p className="text-xs">Memuat webhooks...</p>
      </div>
    );
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-white">Webhooks</h2>
          <p className="text-xs text-slate-500">
            Event real-time via POST JSON + HMAC signature. Gagal? Sistem retry otomatis.
          </p>
        </div>
        <Button onClick={() => setModal(true)}>
          <Icon name="plus" size={14} /> Create Webhook
        </Button>
      </div>

      {data && data.length === 0 ? (
        <EmptyState
          icon={<Icon name="hook" size={30} />}
          title="Belum ada webhook"
          desc='Contoh: kirim event "message.received" ke server Anda setiap ada pesan masuk.'
          action={
            <Button onClick={() => setModal(true)}>
              <Icon name="plus" size={14} /> Create Webhook
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {(data ?? []).map((h) => (
            <div key={h.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="break-all font-mono text-xs text-cyan-300">{h.url}</code>
                    <button
                      onClick={() => toggle(h)}
                      className={`relative h-5 w-9 shrink-0 rounded-full transition ${h.enabled ? "bg-cyan-500/70" : "bg-slate-700"}`}
                      aria-label="Toggle"
                    >
                      <span className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all" style={{ left: h.enabled ? 18 : 2 }} />
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {h.events.map((e) => (
                      <Badge key={e} tone="blue">{e}</Badge>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-slate-500">
                    <span>✓ {h.successCount} sukses</span>
                    <span>✗ {h.failCount} gagal</span>
                    <span>Last: {h.lastTriggeredAt ? timeAgo(h.lastTriggeredAt) : "belum pernah"}</span>
                    <span>Created {fmtDate(h.createdAt)}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2 rounded-lg bg-white/[0.03] px-3 py-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Secret</span>
                    <code className="font-mono text-[11px] text-slate-400">{h.secret.slice(0, 12)}••••</code>
                    <CopyBtn text={h.secret} label="Salin secret" />
                  </div>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Button variant="ghost" className="!px-3 !py-1.5 !text-[11px]" loading={testBusy === h.id} onClick={() => test(h)}>
                    Test
                  </Button>
                  <button onClick={() => del(h)} className="rounded-lg p-1.5 text-slate-500 hover:bg-red-500/10 hover:text-red-400">
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title="Create Webhook">
        <div className="space-y-4">
          <Field label="URL" hint="Harus http(s) dan dapat diakses dari server kami.">
            <input className="input" value={form.url} onChange={(e) => setForm({ url: e.target.value })} placeholder="https://example.com/webhook" />
          </Field>
          <Field label="Events">
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {EVENTS.map((e) => (
                <label key={e} className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                  <input
                    type="checkbox"
                    className="accent-cyan-500"
                    checked={events.includes(e)}
                    onChange={(ev) =>
                      setEvents((p) => (ev.target.checked ? [...p, e] : p.filter((x) => x !== e)))
                    }
                  />
                  <code className="text-[11px] text-slate-300">{e}</code>
                </label>
              ))}
            </div>
          </Field>
          <div className="rounded-lg bg-white/[0.03] px-3 py-2.5 font-mono text-[10px] leading-relaxed text-slate-500">
            {`POST {url}\nx-water-event: message.received\nx-water-signature: sha256(...)\n\n{\n  "event": "message.received",\n  "source": "water-ai-cloud",\n  "data": { ... }\n}`}
          </div>
          <Button className="w-full" loading={busy} onClick={create}>
            Simpan Webhook
          </Button>
        </div>
      </Modal>
    </div>
  );
}
