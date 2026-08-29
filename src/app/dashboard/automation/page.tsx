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
  toast,
  fmtDate,
} from "@/components/ui";

type Auto = {
  id: string;
  type: string;
  name: string;
  trigger: any;
  action: any;
  enabled: boolean;
  createdAt: string;
};
type BotLite = { id: string; name: string; settings: any };

const TYPE_LABEL: Record<string, string> = {
  keyword: "Keyword Reply",
  autoReply: "Auto Reply",
  welcome: "Welcome Message",
  goodbye: "Goodbye Message",
  antiLink: "Anti Link",
  scheduled: "Scheduled Message",
  aiReply: "AI Reply",
};

export default function AutomationPage() {
  const { data: bots, loading } = useApi<BotLite[]>("/dashboard/bots");
  const [botId, setBotId] = useState<string | null>(null);
  const activeBot = botId ?? bots?.[0]?.id ?? null;
  const { data, loading: l2, error, reload } = useApi<Auto[] | null>(
    activeBot ? `/dashboard/automations?botId=${activeBot}` : null,
    [activeBot]
  );
  const bot = bots?.find((b) => b.id === activeBot);

  const [modal, setModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    type: "keyword",
    name: "",
    contains: "",
    text: "",
    to: "",
    at: "",
  });

  // AI assistant settings
  const [ai, setAi] = useState<{ enabled: boolean; model: string; temperature: string; maxTokens: string; systemPrompt: string }>({
    enabled: false,
    model: "gpt-4o-mini",
    temperature: "0.7",
    maxTokens: "300",
    systemPrompt: "Kamu asisten WhatsApp yang ramah dan ringkas.",
  });
  const [aiBusy, setAiBusy] = useState(false);
  const [aiLoaded, setAiLoaded] = useState(false);
  const initAi = (b?: BotLite) => {
    if (!b || aiLoaded) return;
    const s = b.settings?.ai ?? {};
    setAi({
      enabled: !!s.enabled,
      model: s.model ?? "gpt-4o-mini",
      temperature: String(s.temperature ?? 0.7),
      maxTokens: String(s.maxTokens ?? 300),
      systemPrompt: s.systemPrompt ?? "Kamu asisten WhatsApp yang ramah dan ringkas.",
    });
    setAiLoaded(true);
  };

  const create = async () => {
    setBusy(true);
    try {
      const payload: any = { botId: activeBot, type: form.type, name: form.name || TYPE_LABEL[form.type] };
      if (form.type === "keyword") payload.contains = form.contains;
      if (form.type !== "scheduled" && form.type !== "aiReply") payload.text = form.text;
      if (form.type === "scheduled") {
        payload.at = new Date(form.at).toISOString();
        payload.to = form.to;
        payload.text = form.text;
      }
      await api("/dashboard/automations", "POST", payload);
      toast(`${TYPE_LABEL[form.type]} dibuat`, "Logika diproses penuh oleh bot engine.");
      setModal(false);
      setForm({ type: "keyword", name: "", contains: "", text: "", to: "", at: "" });
      reload();
    } catch (e: any) {
      toast(e.message, undefined, "err");
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (a: Auto) => {
    try {
      await api(`/dashboard/automations/${a.id}/toggle`, "POST");
      reload();
    } catch (e: any) {
      toast(e.message, undefined, "err");
    }
  };

  const del = async (a: Auto) => {
    try {
      await api(`/dashboard/automations/${a.id}`, "DELETE");
      toast("Automation dihapus");
      reload();
    } catch (e: any) {
      toast(e.message, undefined, "err");
    }
  };

  const saveAi = async () => {
    if (!activeBot) return;
    setAiBusy(true);
    try {
      await api(`/dashboard/bots/${activeBot}/update`, "POST", {
        settings: {
          ai: {
            enabled: ai.enabled,
            model: ai.model,
            temperature: parseFloat(ai.temperature) || 0.7,
            maxTokens: parseInt(ai.maxTokens, 10) || 300,
            systemPrompt: ai.systemPrompt,
          },
        },
      });
      toast("AI configuration disimpan", "AI key (AI_API_KEY) tersimpan di sisi server.");
    } catch (e: any) {
      toast(e.message, undefined, "err");
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-white">Automation</h2>
          <p className="text-xs text-slate-500">
            WHEN message matches → THEN bot bertindak. Semua logika berjalan di backend.
          </p>
        </div>
        {activeBot && (
          <Button onClick={() => setModal(true)}>
            <Icon name="plus" size={14} /> Builder
          </Button>
        )}
      </div>

      {bots && bots.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {bots.map((b) => (
            <button
              key={b.id}
              onClick={() => setBotId(b.id)}
              className={`shrink-0 rounded-xl border px-4 py-2 text-xs font-semibold transition ${
                activeBot === b.id ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-300" : "border-white/10 bg-white/[0.02] text-slate-400"
              }`}
            >
              {b.name}
            </button>
          ))}
        </div>
      )}

      {/* AI assistant */}
      <div className="card p-5">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-cyan-500/10 p-2 text-cyan-300">
              <Icon name="cpu" size={16} />
            </span>
            <h3 className="text-sm font-bold text-white">AI Assistant</h3>
          </div>
          <button
            onClick={() => setAi((p) => ({ ...p, enabled: !p.enabled }))}
            className={`relative h-5 w-9 rounded-full transition ${ai.enabled ? "bg-cyan-500/70" : "bg-slate-700"}`}
            aria-label="AI toggle"
          >
            <span className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all" style={{ left: ai.enabled ? 18 : 2 }} />
          </button>
        </div>
        <p className="mb-4 text-[11px] text-slate-500">
          AI Auto Reply — model, temperature, max tokens & system prompt. API key AI disimpan aman di server, tidak pernah dikirim ke browser.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Model">
            <input className="input" value={ai.model} onChange={(e) => setAi({ ...ai, model: e.target.value })} />
          </Field>
          <Field label="Temperature">
            <input className="input" type="number" step="0.1" min="0" max="2" value={ai.temperature} onChange={(e) => setAi({ ...ai, temperature: e.target.value })} />
          </Field>
          <Field label="Max Tokens">
            <input className="input" type="number" min="1" value={ai.maxTokens} onChange={(e) => setAi({ ...ai, maxTokens: e.target.value })} />
          </Field>
        </div>
        <div className="mt-3">
          <Field label="System Prompt">
            <textarea className="input min-h-16" value={ai.systemPrompt} onChange={(e) => setAi({ ...ai, systemPrompt: e.target.value })} />
          </Field>
        </div>
        <Button className="mt-4 !py-2 !text-xs" loading={aiBusy} onClick={() => (initAi(bot), saveAi())}>
          Simpan AI Configuration
        </Button>
      </div>

      {loading || (l2 && !data) ? (
        <div className="flex flex-col items-center gap-3 py-16 text-slate-500">
          <Spinner size={22} />
          <p className="text-xs">Loading...</p>
        </div>
      ) : error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !activeBot || !data || data.length === 0 ? (
        <EmptyState
          icon={<Icon name="bolt" size={30} />}
          title="No automations yet"
          desc='Contoh: WHEN message contains "harga" THEN send "Silakan pilih paket yang tersedia."'
          action={
            activeBot ? (
              <Button onClick={() => setModal(true)}>
                <Icon name="plus" size={14} /> Buat Automation
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {data.map((a) => (
            <div key={a.id} className="card card-hover p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="rounded-lg bg-cyan-500/10 p-1.5 text-cyan-300">
                    <Icon name={a.type === "aiReply" ? "cpu" : a.type === "scheduled" ? "clock" : "bolt"} size={14} />
                  </span>
                  <div>
                    <p className="text-xs font-bold text-white">{TYPE_LABEL[a.type] ?? a.type}</p>
                    <p className="text-[10px] text-slate-600">dibuat {fmtDate(a.createdAt)}</p>
                  </div>
                </div>
                <button
                  onClick={() => toggle(a)}
                  className={`relative h-5 w-9 rounded-full transition ${a.enabled ? "bg-cyan-500/70" : "bg-slate-700"}`}
                  aria-label="Toggle"
                >
                  <span className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all" style={{ left: a.enabled ? 18 : 2 }} />
                </button>
              </div>
              <div className="mt-3 rounded-lg bg-white/[0.03] px-3 py-2 text-[11px] text-slate-400">
                {a.type === "keyword" && (
                  <>
                    <b className="text-cyan-300">WHEN</b> message contains{" "}
                    <code className="text-emerald-300">&quot;{a.trigger?.contains}&quot;</code>
                    <br />
                    <b className="text-cyan-300">THEN</b> send: <code className="text-slate-300">&quot;{a.action?.text}&quot;</code>
                  </>
                )}
                {a.type === "scheduled" && (
                  <>
                    <b className="text-cyan-300">AT</b> {a.trigger?.at ? new Date(a.trigger.at).toLocaleString("id-ID") : "—"}
                    <br />
                    <b className="text-cyan-300">TO</b> {a.action?.to}
                  </>
                )}
                {["autoReply", "welcome", "goodbye", "antiLink"].includes(a.type) && (
                  <>
                    <b className="text-cyan-300">THEN</b> send: <code className="text-slate-300">&quot;{a.action?.text}&quot;</code>
                  </>
                )}
                {a.type === "aiReply" && <span>Respon otomatis memakai model AI yang dikonfigurasi di atas.</span>}
              </div>
              <div className="mt-3 flex justify-end">
                <button onClick={() => del(a)} className="rounded-lg p-1.5 text-slate-600 transition hover:bg-red-500/10 hover:text-red-400">
                  <Icon name="trash" size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title="Automation Builder">
        <div className="space-y-4">
          <Field label="Jenis">
            <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="keyword">Keyword Reply</option>
              <option value="autoReply">Auto Reply (fallback)</option>
              <option value="welcome">Welcome Message (grup)</option>
              <option value="goodbye">Goodbye Message (grup)</option>
              <option value="antiLink">Anti Link (grup)</option>
              <option value="scheduled">Scheduled Message</option>
            </select>
          </Field>
          <Field label="Nama (opsional)">
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={TYPE_LABEL[form.type]} />
          </Field>
          {form.type === "keyword" && (
            <Field label="WHEN — message contains">
              <input className="input" value={form.contains} onChange={(e) => setForm({ ...form, contains: e.target.value })} placeholder="harga" />
            </Field>
          )}
          {form.type !== "scheduled" && (
            <Field label="THEN — send" hint="Placeholder {user} = nama pengirim.">
              <textarea className="input min-h-20" value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} placeholder='Silakan pilih paket yang tersedia.' />
            </Field>
          )}
          {form.type === "scheduled" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Kirim ke (JID)">
                  <input className="input" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} placeholder="628123@s.whatsapp.net" />
                </Field>
                <Field label="Waktu">
                  <input className="input" type="datetime-local" value={form.at} onChange={(e) => setForm({ ...form, at: e.target.value })} />
                </Field>
              </div>
              <Field label="Pesan">
                <textarea className="input min-h-20" value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} />
              </Field>
            </>
          )}
          <Button className="w-full" loading={busy} onClick={create}>
            Aktifkan Automation
          </Button>
        </div>
      </Modal>
    </div>
  );
}
