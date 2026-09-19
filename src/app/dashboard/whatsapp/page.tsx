"use client";

import { useEffect, useState } from "react";
import {
  api,
  useApi,
  Icon,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Spinner,
  StatusPill,
  toast,
  fmtDate,
  timeAgo,
} from "@/components/ui";

type WaDetail = {
  bot: { id: string; name: string; status: string; whatsappNumber: string | null };
  wa: {
    status: string;
    phoneNumber: string | null;
    jid: string | null;
    platform: string | null;
    lastPairingCode: string | null;
    lastPairingAt: string | null;
    qrDataUrl: string | null;
    lastQrAt: string | null;
    lastConnectedAt: string | null;
  } | null;
};
type BotLite = { id: string; name: string; status: string };

export default function WhatsAppPage() {
  const { data: bots, loading, error, reload } = useApi<BotLite[]>("/dashboard/bots");
  const [botId, setBotId] = useState<string | null>(null);
  const activeBot = botId ?? bots?.[0]?.id ?? null;
  const { data, loading: loadingWa, reload: reloadWa } = useApi<WaDetail | null>(
    activeBot ? `/dashboard/whatsapp/${activeBot}` : null,
    [activeBot]
  );

  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  // poll while waiting for QR / reconnecting (only when needed)
  const busyStatus = data?.wa?.status;
  useEffect(() => {
    if (!["waiting", "connecting", "reconnecting"].includes(busyStatus ?? "")) return;
    const t = setInterval(reloadWa, 4000);
    return () => clearInterval(t);
  }, [busyStatus, reloadWa]);

  useEffect(() => {
    const fn = () => {
      reload();
      reloadWa();
    };
    window.addEventListener("wac:refresh", fn);
    return () => window.removeEventListener("wac:refresh", fn);
  }, [reload, reloadWa]);

  const doAction = async (action: string, label: string) => {
    if (!activeBot) return;
    setBusy(action);
    try {
      if (action === "logout") await api(`/dashboard/whatsapp/${activeBot}/logout`, "POST");
      else await api(`/dashboard/bots/${activeBot}/${action}`, "POST");
      toast(`${label} diproses`);
      setTimeout(reloadWa, 700);
    } catch (e: any) {
      toast(e.message, undefined, "err");
    } finally {
      setBusy(null);
    }
  };

  const requestPairing = async () => {
    if (!activeBot) return;
    const digits = phone.replace(/\D/g, "");
    if (!digits) {
      toast("Masukkan nomor WhatsApp", "Format: 62812...", "err");
      return;
    }
    setBusy("pairing");
    try {
      const d = await api<{ requested: boolean; code?: string }>(
        `/dashboard/whatsapp/${activeBot}/pairing`,
        "POST",
        { number: digits }
      );
      if (d.code) toast("Pairing code diterima dari WhatsApp", `Kode: ${d.code}`, "ok");
      else toast("Pairing code diminta", "Kode akan muncul otomatis di sini.");
      reloadWa();
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
        <p className="text-xs">Memuat sesi...</p>
      </div>
    );
  if (error && !bots) return <ErrorState message={error} onRetry={reload} />;
  if (!bots || bots.length === 0)
    return (
      <EmptyState
        icon={<Icon name="cloud" size={30} />}
        title="Belum ada bot"
        desc="Buat bot dulu di halaman My Bots, lalu hubungkan WhatsApp di sini."
      />
    );

  const wa = data?.wa;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-lg font-bold text-white">WhatsApp Connection</h2>
        <p className="text-xs text-slate-500">QR & pairing code dihasilkan langsung dari socket WhatsApp (Baileys).</p>
      </div>

      {/* bot selector */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {bots.map((b) => (
          <button
            key={b.id}
            onClick={() => setBotId(b.id)}
            className={`shrink-0 rounded-xl border px-4 py-2 text-xs font-semibold transition ${
              activeBot === b.id
                ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-300"
                : "border-white/10 bg-white/[0.02] text-slate-400 hover:border-white/20"
            }`}
          >
            {b.name}
          </button>
        ))}
      </div>

      {loadingWa && !data ? (
        <div className="flex flex-col items-center gap-3 py-16 text-slate-500">
          <Spinner size={22} />
          <p className="text-xs">Connecting...</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {/* QR */}
          <div className="card p-5 lg:col-span-1">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">QR Code</h3>
              {wa && <StatusPill status={wa.status} />}
            </div>
            {wa?.qrDataUrl ? (
              <div className="flex flex-col items-center">
                {/* QR is a server-generated data URL; next/image cannot optimize this dynamic source. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={wa.qrDataUrl}
                  alt="QR code WhatsApp"
                  className="rounded-xl border border-white/10 bg-white p-2"
                  width={232}
                  height={232}
                />
                <p className="mt-3 text-center text-[11px] text-slate-500">
                  WhatsApp → Settings → Linked Devices → Link a Device
                  {wa.lastQrAt && <span className="block">Dibuat {timeAgo(wa.lastQrAt)}</span>}
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center rounded-xl border border-dashed border-slate-700/60 py-10">
                {wa?.status === "connected" ? (
                  <>
                    <Icon name="check" size={28} className="text-emerald-400" />
                    <p className="mt-2 text-xs font-semibold text-emerald-300">Sudah terhubung</p>
                    <p className="mt-1 text-[11px] text-slate-500">QR tidak diperlukan.</p>
                  </>
                ) : (
                  <>
                    <Icon name="qr" size={28} className="text-slate-600" />
                    <p className="mt-2 text-xs text-slate-500">
                      {wa?.status === "offline" || wa?.status === "disconnected"
                        ? "Start bot untuk menampilkan QR."
                        : "Menunggu QR dari server WhatsApp..."}
                    </p>
                    {(wa?.status === "offline" || wa?.status === "disconnected") && (
                      <Button className="mt-4 !py-2 !text-xs" loading={busy === "start"} onClick={() => doAction("start", "Start")}>
                        <Icon name="play" size={12} /> Start Bot
                      </Button>
                    )}
                    {wa?.status === "waiting" && (
                      <Button variant="ghost" className="mt-4 !py-2 !text-xs" onClick={reloadWa}>
                        <Icon name="refresh" size={12} /> Segarkan QR
                      </Button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* details + pairing */}
          <div className="space-y-4 lg:col-span-2">
            <div className="card p-5">
              <h3 className="mb-4 text-sm font-bold text-white">Connection Status</h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Detail label="Phone Number" value={wa?.phoneNumber ? `+${wa.phoneNumber}` : "—"} />
                <Detail label="Device (JID)" value={wa?.jid ?? "—"} mono />
                <Detail label="Platform" value={wa?.platform ?? "—"} />
                <Detail label="Last Connected" value={wa?.lastConnectedAt ? fmtDate(wa.lastConnectedAt) : "belum pernah"} />
                <Detail label="Pairing Code" value={wa?.lastPairingCode ? `••${wa.lastPairingCode.slice(-2)}` : "—"} />
                <Detail label="Pairing Time" value={wa?.lastPairingAt ? fmtDate(wa.lastPairingAt) : "—"} />
              </div>
              <div className="mt-5 flex flex-wrap gap-2 border-t border-white/5 pt-4">
                <Button className="!py-2 !text-xs" loading={busy === "reconnect"} onClick={() => doAction("reconnect", "Reconnect")}>
                  <Icon name="wifi" size={13} /> Reconnect
                </Button>
                {["online", "connecting", "waiting", "reconnecting"].includes(data?.bot.status ?? "") && (
                  <Button variant="ghost" className="!py-2 !text-xs" loading={busy === "stop"} onClick={() => doAction("stop", "Stop")}>
                    <Icon name="stop" size={13} /> Stop Bot
                  </Button>
                )}
                <Button variant="danger" className="!py-2 !text-xs" loading={busy === "logout"} onClick={() => doAction("logout", "Logout WA")}>
                  <Icon name="trash" size={13} /> Logout WhatsApp
                </Button>
              </div>
            </div>

            <div className="card p-5">
              <h3 className="mb-1 text-sm font-bold text-white">Pairing Code</h3>
              <p className="mb-4 text-[11px] text-slate-500">
                Alternatif QR: kode 8 digit <b>dihasilkan server WhatsApp</b> (melalui Baileys).
                Hanya tersedia saat nomor belum linked — setelah connected gunakan QR/Reconnect.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  className="input flex-1"
                  placeholder="6281234567890"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  inputMode="numeric"
                />
                <Button className="!py-2" loading={busy === "pairing"} onClick={requestPairing}>
                  <Icon name="qr" size={13} /> Minta Pairing Code
                </Button>
              </div>
              {wa?.lastPairingCode && (
                <div className="mt-4 rounded-xl border border-cyan-500/25 bg-cyan-500/5 px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-400/80">
                    Pairing code asli dari WhatsApp ({timeAgo(wa.lastPairingAt)})
                  </p>
                  <p className="mt-1 font-display text-2xl font-bold tracking-[0.4em] text-white">
                    {wa.lastPairingCode}
                  </p>
                  <p className="mt-1.5 text-[10px] text-slate-500">
                    Di WhatsApp: Link a Device → Enter pairing code instead.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl bg-white/[0.03] px-3 py-2.5">
      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-600">{label}</p>
      <p className={`mt-0.5 truncate text-xs text-slate-300 ${mono ? "font-mono text-[10px]" : ""}`}>{value}</p>
    </div>
  );
}
