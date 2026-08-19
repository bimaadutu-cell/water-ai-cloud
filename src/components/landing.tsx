"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon, fmtNum, Badge } from "./ui";
import { Logo } from "./logo";

/* --------------------------------- Navbar -------------------------------- */
export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 24);
    fn();
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);
  const links = [
    { href: "/#features", label: "Features" },
    { href: "/#pricing", label: "Pricing" },
    { href: "/#api", label: "API" },
    { href: "/docs", label: "Documentation" },
    { href: "/status", label: "Status" },
    { href: "/#faq", label: "FAQ" },
  ];
  return (
    <header
      className={`fixed inset-x-0 top-0 z-40 transition-all duration-300 ${
        scrolled ? "glass-strong py-2 shadow-lg shadow-black/30" : "bg-transparent py-4"
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/" aria-label="WATER AI CLOUD home">
          <Logo size={30} />
        </Link>
        <nav className="hidden items-center gap-1 lg:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-lg px-3 py-2 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-2 lg:flex">
          <Link href="/login" className="btn btn-ghost !py-2">
            Login
          </Link>
          <Link href="/register" className="btn btn-primary !py-2">
            Get Started
          </Link>
        </div>
        <button
          className="rounded-lg p-2 text-slate-300 lg:hidden"
          onClick={() => setOpen(!open)}
          aria-label="Menu"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {open ? <path d="M18 6 6 18M6 6l12 12" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>
      {open && (
        <div className="anim-fade-in border-t border-white/5 glass-strong mx-3 mt-2 rounded-xl p-3 lg:hidden">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-2.5 text-sm text-slate-300 hover:bg-white/5"
            >
              {l.label}
            </Link>
          ))}
          <div className="mt-2 flex gap-2 border-t border-white/5 pt-3">
            <Link href="/login" onClick={() => setOpen(false)} className="btn btn-ghost flex-1">
              Login
            </Link>
            <Link href="/register" onClick={() => setOpen(false)} className="btn btn-primary flex-1">
              Get Started
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

/* ------------------------------ Live stats ------------------------------ */
type Stats = {
  activeBots: number;
  onlineConnections: number;
  messagesProcessed: number;
  apiRequests: number;
  uptimeSec: number;
};

export function useLiveStats(initial: Stats) {
  const [stats, setStats] = useState<Stats>(initial);
  useEffect(() => {
    const es = new EventSource("/api/events");
    const onStats = (e: MessageEvent) => {
      try {
        setStats((prev) => ({ ...prev, ...JSON.parse(e.data) }));
      } catch {
        /* ignore */
      }
    };
    es.addEventListener("stats", onStats);
    return () => es.close();
  }, []);
  return stats;
}

export function LiveStats({ initial }: { initial: Stats }) {
  const s = useLiveStats(initial);
  const items = [
    { label: "Active Bots", value: s.activeBots.toLocaleString(), icon: "bot" },
    { label: "Online Connections", value: s.onlineConnections.toLocaleString(), icon: "wifi" },
    { label: "Messages Processed", value: `${fmtNum(s.messagesProcessed)}+`, icon: "msg" },
    { label: "API Requests", value: `${fmtNum(s.apiRequests)}+`, icon: "code" },
    {
      label: "Uptime",
      value: `${Math.floor(s.uptimeSec / 3600)}h ${Math.floor((s.uptimeSec % 3600) / 60)}m`,
      icon: "clock",
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((it) => (
        <div key={it.label} className="card card-hover px-4 py-4">
          <div className="flex items-center gap-2 text-cyan-400/80">
            <Icon name={it.icon} size={15} />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              {it.label}
            </span>
          </div>
          <p className="mt-2 font-display text-2xl font-bold text-white tabular-nums">{it.value}</p>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------- Hero preview ------------------------------ */
function Meter({ label, value, delay }: { label: string; value: number; delay: number }) {
  const [w, setW] = useState(value);
  useEffect(() => {
    setW(value);
    const t = setInterval(() => {
      setW((v) => Math.min(92, Math.max(12, v + (Math.random() * 10 - 5))));
    }, 2600);
    return () => clearInterval(t);
  }, [value]);
  return (
    <div>
      <div className="flex justify-between text-[10px] text-slate-500">
        <span>{label}</span>
        <span className="tabular-nums">{Math.round(w)}%</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/5">
        <div
          className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all duration-1000"
          style={{ width: `${w}%`, transitionDelay: `${delay}ms` }}
        />
      </div>
    </div>
  );
}

export function HeroPreview({ stats }: { stats: Stats }) {
  const bars = useRef([34, 52, 41, 66, 48, 72, 58, 81, 63, 90, 71, 84]).current;
  const connected = stats.onlineConnections > 0;
  return (
    <div className="relative anim-float">
      <div className="absolute -inset-6 rounded-3xl bg-cyan-500/10 blur-3xl" aria-hidden />
      <div className="glass relative overflow-hidden rounded-2xl shadow-2xl shadow-cyan-500/10">
        <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-red-400/60" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400/60" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/60" />
            </span>
            <span className="ml-2 text-xs font-semibold text-slate-300">waterbot-01</span>
          </div>
          {connected ? (
            <Badge tone="green">
              <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-current" />
              ONLINE
            </Badge>
          ) : (
            <Badge tone="amber">
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              STANDBY
            </Badge>
          )}
        </div>
        <div className="space-y-4 p-4">
          {connected ? (
            <div className="flex items-center justify-between rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <Icon name="cloud" size={16} className="text-emerald-400" />
                <div>
                  <p className="text-[11px] font-semibold text-emerald-300">WhatsApp Connected</p>
                  <p className="text-[10px] text-emerald-400/60">
                    {stats.onlineConnections} koneksi multi-device aktif di cloud
                  </p>
                </div>
              </div>
              <Icon name="check" size={14} className="text-emerald-400" />
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <Icon name="qr" size={16} className="text-amber-400" />
                <div>
                  <p className="text-[11px] font-semibold text-amber-300">Belum ada koneksi WhatsApp</p>
                  <p className="text-[10px] text-amber-400/70">
                    Start bot di dashboard lalu scan QR / pairing code
                  </p>
                </div>
              </div>
              <Icon name="clock" size={14} className="text-amber-400" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Meter label="CPU" value={34} delay={0} />
            <Meter label="Memory" value={47} delay={300} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-white/[0.03] px-3 py-2.5">
              <p className="text-[9px] uppercase tracking-wider text-slate-500">Messages</p>
              <p className="font-display text-lg font-bold text-white tabular-nums">
                {fmtNum(stats.messagesProcessed)}
              </p>
            </div>
            <div className="rounded-xl bg-white/[0.03] px-3 py-2.5">
              <p className="text-[9px] uppercase tracking-wider text-slate-500">Uptime</p>
              <p className="font-display text-lg font-bold text-white tabular-nums">
                {Math.floor(stats.uptimeSec / 3600)}h
              </p>
            </div>
            <div className="rounded-xl bg-white/[0.03] px-3 py-2.5">
              <p className="text-[9px] uppercase tracking-wider text-slate-500">API Calls</p>
              <p className="font-display text-lg font-bold text-white tabular-nums">
                {fmtNum(stats.apiRequests)}
              </p>
            </div>
          </div>
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
            <p className="mb-2 text-[9px] uppercase tracking-wider text-slate-500">
              Traffic — ilustrasi
            </p>
            <div className="flex h-12 items-end gap-1">
              {bars.map((b, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-sm bg-gradient-to-t from-cyan-500/30 to-cyan-400 anim-pulse-soft"
                  style={{ height: `${b}%`, animationDelay: `${i * 180}ms` }}
                />
              ))}
            </div>
          </div>
        </div>
        <p className="border-t border-white/5 px-4 py-2 text-center text-[9px] text-slate-600">
          Live dari cloud WATER AI CLOUD — angka nyata dari server
        </p>
      </div>
    </div>
  );
}

/* --------------------------------- Pricing ------------------------------- */
export type Plan = {
  id: string;
  name: string;
  price: number;
  period: string;
  botLimit: number;
  featured?: boolean;
  cta?: string;
  features: string[];
};

export function PricingCards({ plans }: { plans: Plan[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {plans.map((p) => (
        <div
          key={p.id}
          className={`card card-hover relative flex flex-col p-5 ${
            p.featured ? "glow-ring border-cyan-500/40" : ""
          }`}
        >
          {p.featured && (
            <span className="animated-gradient absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-0.5 text-[10px] font-bold text-ink-950">
              POPULER
            </span>
          )}
          <h3 className="font-display text-sm font-bold tracking-wider text-white">{p.name}</h3>
          <p className="mt-2">
            <span className="font-display text-3xl font-bold text-white">
              {p.period === "custom" || p.price === 0 ? (p.period === "custom" ? "Custom" : "Rp0") : `Rp${p.price.toLocaleString("id-ID")}`}
            </span>
            {p.period === "month" && <span className="ml-1 text-xs text-slate-500">/bulan</span>}
            {p.period === "forever" && <span className="ml-1 text-xs text-slate-500">selamanya</span>}
          </p>
          <ul className="mt-4 flex-1 space-y-2">
            {p.features.map((f) => (
              <li key={f} className="flex items-start gap-2 text-xs text-slate-400">
                <Icon name="check" size={13} className="mt-0.5 shrink-0 text-cyan-400" />
                {f}
              </li>
            ))}
          </ul>
          <Link
            href={p.period === "custom" ? "/dashboard/support" : "/register"}
            className={`btn mt-5 w-full ${p.featured ? "btn-primary" : "btn-ghost"} !py-2 !text-xs`}
          >
            {p.cta ?? "Pilih"}
          </Link>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------- FAQ ---------------------------------- */
const FAQS = [
  {
    q: "Apa itu WATER AI CLOUD?",
    a: "WATER AI CLOUD adalah platform cloud untuk menjalankan bot WhatsApp Anda 24/7. Hubungkan nomor WhatsApp lewat QR atau pairing code, kelola bot, command, automation, webhook, dan REST API dari satu dashboard.",
  },
  {
    q: "Bagaimana cara menghubungkan WhatsApp?",
    a: "Buat bot di dashboard, klik Start, lalu scan QR code dengan WhatsApp Anda (Settings → Linked Devices) atau gunakan pairing code. Sesi tersimpan aman di server sehingga Anda tidak perlu scan ulang.",
  },
  {
    q: "Apa itu Bot Instance?",
    a: "Setiap bot adalah instance terisolasi dengan ID unik, sesi WhatsApp sendiri, konfigurasi prefix/command sendiri, dan credential API sendiri. Bot A disconnect tidak memengaruhi Bot B.",
  },
  {
    q: "Apakah bot berjalan 24/7?",
    a: "Ya. Bot engine kami berjalan di server cloud. Jika koneksi WhatsApp terputus, sistem mendeteksi dan melakukan reconnect otomatis dengan exponential backoff hingga kembali online.",
  },
  {
    q: "Bagaimana cara menggunakan API?",
    a: "Buat API Key di dashboard, lalu panggil endpoint REST (mis. POST /api/v1/messages/text) dengan header Authorization: Bearer WATER_API_KEY. Setiap request tervalidasi dan tercatat di log.",
  },
  {
    q: "Bagaimana cara mendapatkan API Key?",
    a: "Buka dashboard → API Keys → Create API Key. Pilih permission (messages.send, bots.manage, dll). Key hanya ditampilkan sekali; server hanya menyimpan hash-nya.",
  },
  {
    q: "Apa itu Webhook?",
    a: "Webhook memungkinkan server Anda menerima event real-time (message.received, bot.connected, dll) sebagai POST JSON yang ditandatangani HMAC-SHA256. Gagal kirim? Sistem melakukan retry otomatis.",
  },
  {
    q: "Bagaimana cara menghubungkan AI?",
    a: "Aktifkan AI Reply di menu Automation → AI Assistant. Set model, temperature, max tokens, dan system prompt. AI key disimpan di sisi server dan tidak pernah diekspos ke frontend.",
  },
  {
    q: "Bagaimana jika WhatsApp disconnect?",
    a: "Status berubah menjadi RECONNECTING. Engine mencoba ulang secara bertahap (backoff). Jika berhasil, status kembali CONNECTED dan event bot.connected dikirim ke webhook/notification Anda.",
  },
  {
    q: "Apakah data aman?",
    a: "Password di-hash (scrypt), sesi pakai token acak berhash, API key hanya disimpan sebagai hash, webhook ditandatangani secret, semua endpoint tervalidasi + rate limited. Kredensial WhatsApp terisolasi per-bot di storage server.",
  },
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="mx-auto max-w-3xl space-y-3">
      {FAQS.map((f, i) => (
        <div key={i} className="card overflow-hidden">
          <button
            className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
            onClick={() => setOpen(open === i ? null : i)}
            aria-expanded={open === i}
          >
            <span className="text-sm font-semibold text-slate-200">{f.q}</span>
            <span
              className={`shrink-0 text-cyan-400 transition-transform duration-300 ${
                open === i ? "rotate-45" : ""
              }`}
            >
              <Icon name="plus" size={16} />
            </span>
          </button>
          <div
            className="grid transition-all duration-300 ease-out"
            style={{ gridTemplateRows: open === i ? "1fr" : "0fr" }}
          >
            <div className="overflow-hidden">
              <p className="px-5 pb-4 text-sm leading-relaxed text-slate-400">{f.a}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------- Code tabs ------------------------------- */
const SAMPLES: Record<string, string> = {
  cURL: `curl -X POST \\
  "${process.env.NEXT_PUBLIC_API_URL || ""}http://localhost:3000/api/v1/messages/text" \\
  -H "Authorization: Bearer WAC_xxxxxxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "to": "6281234567890@s.whatsapp.net",
    "text": "Halo dari WATER AI CLOUD!"
  }'`,
  JavaScript: `const res = await fetch("https://api.example.com/api/v1/messages/text", {
  method: "POST",
  headers: {
    "Authorization": "Bearer WAC_xxxxxxxxxxxx",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    to: "6281234567890@s.whatsapp.net",
    text: "Halo dari WATER AI CLOUD!",
  }),
});
const json = await res.json(); // { success: true, data: {...} }`,
  "Node.js": `const res = await fetch("https://api.example.com/api/v1/messages/text", {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${process.env.WATER_API_KEY}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    to: "6281234567890@s.whatsapp.net",
    text: "Halo dari WATER AI CLOUD!",
  }),
});
console.log(await res.json());`,
  Python: `import requests

r = requests.post(
    "https://api.example.com/api/v1/messages/text",
    headers={
        "Authorization": "Bearer WAC_xxxxxxxxxxxx",
        "Content-Type": "application/json",
    },
    json={
        "to": "6281234567890@s.whatsapp.net",
        "text": "Halo dari WATER AI CLOUD!",
    },
)
print(r.json())`,
};

export function CodeTabs() {
  const [tab, setTab] = useState("cURL");
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#07090c]">
      <div className="flex items-center gap-1 border-b border-white/5 bg-white/[0.02] px-3 py-2">
        {Object.keys(SAMPLES).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              tab === t ? "bg-cyan-500/15 text-cyan-300" : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      <pre className="overflow-x-auto p-4 text-[12px] leading-relaxed text-slate-300">
        <code>{SAMPLES[tab]}</code>
      </pre>
    </div>
  );
}
