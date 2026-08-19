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

type Ticket = {
  id: string;
  subject: string;
  status: string;
  priority: string;
  createdAt: string;
  updatedAt: string;
};
type TicketMsg = { id: string; body: string; own: boolean; userId: string | null; createdAt: string };
type TicketDetail = Ticket & { messages: TicketMsg[] };

export default function SupportPage() {
  const { data, loading, error, reload } = useApi<Ticket[]>("/dashboard/tickets");
  const [selected, setSelected] = useState<string | null>(null);
  const { data: detail, reload: reloadDetail } = useApi<TicketDetail | null>(
    selected ? `/dashboard/tickets/${selected}` : null,
    [selected]
  );

  const [modal, setModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ subject: "", priority: "normal", message: "" });
  const [reply, setReply] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    try {
      const d = await api<Ticket>("/dashboard/tickets", "POST", form);
      toast("Ticket dibuat", "Tim support akan menjawab secepatnya.");
      setModal(false);
      setForm({ subject: "", priority: "normal", message: "" });
      reload();
      setSelected(d.id);
    } catch (e: any) {
      toast(e.message, undefined, "err");
    } finally {
      setBusy(false);
    }
  };

  const sendReply = async () => {
    if (!selected || !reply.trim()) return;
    setReplyBusy(true);
    try {
      await api(`/dashboard/tickets/${selected}/reply`, "POST", { body: reply });
      setReply("");
      reload();
      reloadDetail();
    } catch (e: any) {
      toast(e.message, undefined, "err");
    } finally {
      setReplyBusy(false);
    }
  };

  const closeTicket = async () => {
    if (!selected) return;
    try {
      await api(`/dashboard/tickets/${selected}/close`, "POST");
      toast("Ticket ditutup");
      reload();
      reloadDetail();
    } catch (e: any) {
      toast(e.message, undefined, "err");
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-white">Support</h2>
          <p className="text-xs text-slate-500">Buka ticket, lihat jawaban, dan follow-up percakapan.</p>
        </div>
        <Button onClick={() => setModal(true)}>
          <Icon name="plus" size={14} /> Create Ticket
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* list */}
        <div className="space-y-2 lg:col-span-1">
          {loading && !data ? (
            <div className="flex justify-center py-16"><Spinner size={20} /></div>
          ) : error && !data ? (
            <ErrorState message={error} onRetry={reload} />
          ) : data && data.length === 0 ? (
            <EmptyState icon={<Icon name="headset" size={28} />} title="No tickets" desc="Buat ticket pertama untuk support." />
          ) : (
            (data ?? []).map((t) => (
              <button
                key={t.id}
                onClick={() => setSelected(t.id)}
                className={`card w-full p-4 text-left transition ${selected === t.id ? "glow-ring" : "card-hover"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-xs font-bold text-white">{t.subject}</p>
                  <Badge tone={t.status === "open" ? "cyan" : t.status === "waiting" ? "amber" : t.status === "answered" ? "green" : "slate"}>
                    {t.status.toUpperCase()}
                  </Badge>
                </div>
                <p className="mt-1.5 text-[10px] text-slate-600">
                  {t.priority} · updated {fmtDate(t.updatedAt)}
                </p>
              </button>
            ))
          )}
        </div>

        {/* detail */}
        <div className="card p-5 lg:col-span-2">
          {!selected ? (
            <div className="flex h-full min-h-48 flex-col items-center justify-center text-slate-600">
              <Icon name="msg" size={28} />
              <p className="mt-2 text-xs">Pilih ticket untuk melihat percakapan.</p>
            </div>
          ) : !detail ? (
            <div className="flex justify-center py-12"><Spinner size={20} /></div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-3">
                <div>
                  <p className="text-sm font-bold text-white">{detail.subject}</p>
                  <p className="text-[10px] text-slate-600">Dibuat {fmtDate(detail.createdAt)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={detail.status === "open" ? "cyan" : detail.status === "waiting" ? "amber" : detail.status === "answered" ? "green" : "slate"}>
                    {detail.status.toUpperCase()}
                  </Badge>
                  {detail.status !== "closed" && (
                    <Button variant="danger" className="!px-3 !py-1.5 !text-[11px]" onClick={closeTicket}>
                      Close
                    </Button>
                  )}
                </div>
              </div>
              <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
                {detail.messages.map((m) => (
                  <div key={m.id} className={`flex ${m.own ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                        m.own
                          ? "rounded-br-sm bg-cyan-500/15 text-cyan-100"
                          : "rounded-bl-sm bg-white/[0.05] text-slate-300"
                      }`}
                    >
                      <p>{m.body}</p>
                      <p className={`mt-1 text-[9px] ${m.own ? "text-cyan-400/60" : "text-slate-600"}`}>
                        {m.own ? "Anda" : "Support"} · {fmtDate(m.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              {detail.status !== "closed" ? (
                <div className="flex gap-2 border-t border-white/5 pt-3">
                  <input
                    className="input flex-1"
                    placeholder="Tulis reply..."
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && sendReply()}
                  />
                  <Button className="!py-2" loading={replyBusy} onClick={sendReply}>
                    <Icon name="send" size={13} />
                  </Button>
                </div>
              ) : (
                <p className="border-t border-white/5 pt-3 text-center text-[11px] text-slate-600">
                  Ticket ini sudah ditutup.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="Create Ticket">
        <div className="space-y-4">
          <Field label="Subjek">
            <input className="input" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} maxLength={140} />
          </Field>
          <Field label="Prioritas">
            <select className="input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </select>
          </Field>
          <Field label="Pesan">
            <textarea className="input min-h-24" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Jelaskan masalah Anda..." />
          </Field>
          <Button className="w-full" loading={busy} onClick={create}>
            Kirim Ticket
          </Button>
        </div>
      </Modal>
    </div>
  );
}
