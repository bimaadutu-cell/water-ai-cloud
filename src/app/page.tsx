import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { announcements } from "@/db/schema";
import { getPlans, getSetting } from "@/server/lib";
import { computeStats, computeSystemStatus } from "@/server/sse";
import { Logo } from "@/components/logo";
import { Icon, Badge } from "@/components/ui";
import {
  Navbar,
  HeroPreview,
  LiveStats,
  PricingCards,
  Faq,
  CodeTabs,
  type Plan,
} from "@/components/landing";

export const dynamic = "force-dynamic";

const FEATURES = [
  { icon: "cloud", title: "WhatsApp Bot Cloud", desc: "Jalankan bot di cloud kami tanpa VPS. Instance terisolasi, sesi aman, online 24/7." },
  { icon: "gauge", title: "Real-time Dashboard", desc: "Status bot, koneksi, pesan, dan API request ter-update live via Server-Sent Events." },
  { icon: "qr", title: "QR Connection", desc: "Scan QR asli dari socket WhatsApp untuk menghubungkan nomor Anda dalam hitungan detik." },
  { icon: "shield", title: "Pairing Code", desc: "Tidak mau scan? Gunakan pairing code 8 digit yang dihasilkan langsung oleh gateway." },
  { icon: "layers", title: "Multi Bot", desc: "Kelola banyak nomor WhatsApp secara bersamaan — setiap bot punya sesi & konfigurasi sendiri." },
  { icon: "code", title: "REST API", desc: "Kirim teks, media, lokasi, dan kontak via API yang konsisten, tervalidasi, dan terdokumentasi." },
  { icon: "hook", title: "Webhook", desc: "Terima event real-time dengan tanda tangan HMAC-SHA256 dan retry otomatis saat gagal." },
  { icon: "bolt", title: "Automation", desc: "Keyword reply, auto reply, welcome, anti-link, scheduled message — diproses penuh di backend." },
  { icon: "cpu", title: "AI Integration", desc: "Hubungkan model AI (OpenAI-compatible) untuk auto reply cerdas. Key AI aman di server." },
  { icon: "send", title: "Media Messaging", desc: "Kirim gambar, video, audio, dan dokumen lewat dashboard atau API secara native." },
  { icon: "doc", title: "Command Management", desc: "Buat, ubah, dan atur permission command dengan prefix yang bisa dikustomisasi." },
  { icon: "user", title: "User Management", desc: "Sistem peran USER / RESELLER / ADMIN dengan otorisasi di sisi server, bukan hanya di UI." },
  { icon: "eye", title: "Bot Monitoring", desc: "Uptime, CPU, jumlah pesan terkirim/diterima, dan last activity per bot secara real-time." },
  { icon: "scroll", title: "Logs", desc: "Setiap aksi tercatat: login, bot lifecycle, command, API request, dan error — dengan filter & search." },
  { icon: "chart", title: "Analytics", desc: "Pesan, command, API request, webhook, dan error dalam rentang waktu yang Anda pilih." },
  { icon: "key", title: "API Keys", desc: "Key per-project dengan permission granular, IP whitelist, dan counter request. Hashed di DB." },
  { icon: "bell", title: "Notifications", desc: "Pusat notifikasi real-time: bot connected, webhook gagal, subscription hampir habis, dan lainnya." },
  { icon: "gear", title: "Custom Configuration", desc: "Prefix, owner number, filter, dan setting AI per bot — simpan dan ubah kapan saja." },
  { icon: "card", title: "Session Management", desc: "Lihat semua perangkat yang login ke akun Anda dan revoke sesi yang tidak dikenal." },
  { icon: "refresh", title: "Auto Reconnect", desc: "Disconnect terdeteksi otomatis lalu di-retry dengan exponential backoff — tanpa loop tak terbatas." },
];

const ENDPOINTS = [
  ["POST", "/api/v1/messages/text"],
  ["POST", "/api/v1/messages/image"],
  ["POST", "/api/v1/messages/video"],
  ["POST", "/api/v1/messages/audio"],
  ["POST", "/api/v1/messages/document"],
  ["POST", "/api/v1/messages/contact"],
  ["POST", "/api/v1/messages/location"],
  ["GET", "/api/v1/bot/status"],
  ["GET", "/api/v1/bots"],
  ["POST", "/api/v1/bots"],
  ["DELETE", "/api/v1/bots/{id}"],
  ["POST", "/api/v1/webhooks"],
];

const METHOD_TONE: Record<string, "cyan" | "green" | "red" | "amber"> = {
  GET: "cyan",
  POST: "green",
  DELETE: "red",
  PUT: "amber",
};

export default async function LandingPage() {
  let stats = {
    activeBots: 0,
    onlineConnections: 0,
    messagesProcessed: 0,
    apiRequests: 0,
    uptimeSec: 0,
  };
  let plans: Plan[] = [];
  let status: {
    website: string;
    api: string;
    database: string;
    botEngine: string;
    whatsappGateway: string;
    webhookService: string;
  } | null = null;
  let anns: (typeof announcements.$inferSelect)[] = [];
  let maintenance: { active?: boolean; message?: string } | null = null;
  try {
    [stats, plans, status, anns, maintenance] = await Promise.all([
      computeStats(),
      getPlans(),
      computeSystemStatus(),
      db.select().from(announcements).where(eq(announcements.published, true)).limit(1),
      getSetting<{ active?: boolean; message?: string }>("maintenance"),
    ]);
  } catch {
    /* render with zeros */
  }

  const statusItems = status
    ? [
        { name: "Website", value: status.website },
        { name: "API", value: status.api },
        { name: "Database", value: status.database },
        { name: "Bot Engine", value: status.botEngine },
        { name: "WhatsApp Gateway", value: status.whatsappGateway },
        { name: "Webhook Service", value: status.webhookService },
      ]
    : [];

  return (
    <div className="relative min-h-screen">
      {/* backgrounds */}
      <div className="grid-bg pointer-events-none absolute inset-x-0 top-0 h-[720px]" aria-hidden />
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-[120px]" aria-hidden />

      <Navbar />

      {/* maintenance banner */}
      {maintenance?.active && (
        <div className="mt-16 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2.5 text-center text-xs text-amber-300">
          <Icon name="alert" size={13} className="mr-1.5 inline" />
          Mode maintenance aktif — dashboard sedang dinonaktifkan sementara.
        </div>
      )}

      {/* announcement */}
      {anns[0] && (
        <div className="mx-auto mt-16 max-w-3xl px-4">
          <div className="glass flex items-start gap-3 rounded-xl px-4 py-3">
            <Icon name="bell" size={15} className="mt-0.5 shrink-0 text-cyan-400" />
            <p className="text-xs text-slate-300">
              <b className="text-white">{anns[0].title}:</b> {anns[0].content}
            </p>
          </div>
        </div>
      )}

      {/* 1+2. Hero */}
      <section className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 pb-16 pt-28 sm:px-6 lg:grid-cols-2 lg:gap-14 lg:pt-36">
        <div>
          <div className="anim-fade-up mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-500/25 bg-cyan-500/5 px-3 py-1.5 text-[11px] font-semibold text-cyan-300">
            <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-cyan-400" />
            Cloud WhatsApp Bot Engine — online sekarang
          </div>
          <h1 className="anim-fade-up font-display text-4xl font-bold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-[3.4rem]">
            Build Smarter WhatsApp Automation with{" "}
            <span className="text-gradient">WATER AI CLOUD</span>
          </h1>
          <p className="anim-fade-up mt-5 max-w-xl text-base leading-relaxed text-slate-400 sm:text-lg" style={{ animationDelay: "0.1s" }}>
            Connect your WhatsApp, deploy your bot, automate conversations, and manage everything
            from one powerful cloud dashboard.
          </p>
          <div className="anim-fade-up mt-7 flex flex-wrap gap-3" style={{ animationDelay: "0.18s" }}>
            <Link href="/register" className="btn btn-primary !px-6 !py-3 !text-sm">
              Get Started
              <Icon name="send" size={14} />
            </Link>
            <Link href="/#api" className="btn btn-ghost !px-6 !py-3 !text-sm">
              <Icon name="code" size={14} />
              Explore API
            </Link>
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] text-slate-500">
            <span className="flex items-center gap-1.5"><Icon name="check" size={12} className="text-cyan-500" /> Tanpa VPS</span>
            <span className="flex items-center gap-1.5"><Icon name="check" size={12} className="text-cyan-500" /> Session terisolasi per bot</span>
            <span className="flex items-center gap-1.5"><Icon name="check" size={12} className="text-cyan-500" /> API + Webhook + AI</span>
          </div>
        </div>
        <div className="anim-fade-up" style={{ animationDelay: "0.2s" }}>
          <HeroPreview stats={stats} />
        </div>
      </section>

      {/* 3. Live statistics */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6">
        <LiveStats initial={stats} />
      </section>

      {/* 4. Features */}
      <section id="features" className="mx-auto max-w-7xl scroll-mt-24 px-4 py-24 sm:px-6">
        <div className="mb-12 max-w-2xl">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-cyan-400">Features</p>
          <h2 className="font-display text-3xl font-bold text-white sm:text-4xl">
            Semua yang Anda butuhkan untuk <span className="text-gradient">automation kelas enterprise</span>
          </h2>
          <p className="mt-3 text-sm text-slate-400 sm:text-base">
            Dari koneksi WhatsApp hingga AI — satu platform, tanpa ribet managing server.
          </p>
        </div>
        <div className="stagger grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="card card-hover group p-5">
              <div className="mb-3 inline-flex rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-2.5 text-cyan-300 transition group-hover:bg-cyan-500/20">
                <Icon name={f.icon} size={19} />
              </div>
              <h3 className="text-sm font-bold text-white">{f.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 5. How it works */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="mb-12 max-w-2xl">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-cyan-400">How it works</p>
          <h2 className="font-display text-3xl font-bold text-white sm:text-4xl">
            Online dalam <span className="text-gradient">4 langkah</span>
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { n: "01", t: "Create Account", d: "Daftar gratis, tanpa kartu kredit. Akun langsung siap pakai." },
            { n: "02", t: "Connect WhatsApp", d: "Scan QR atau pakai pairing code. Sesi tersimpan di cloud." },
            { n: "03", t: "Configure Your Bot", d: "Set prefix, command, automation, webhook, dan AI." },
            { n: "04", t: "Run 24/7", d: "Engine kami menjaga bot online. Auto reconnect kalau terputus." },
          ].map((s, i) => (
            <div key={s.n} className="card relative overflow-hidden p-5">
              <span className="absolute -right-2 -top-4 font-display text-[64px] font-bold text-white/[0.04]">
                {s.n}
              </span>
              <span className="font-display text-xs font-bold text-cyan-400">{s.n}</span>
              <h3 className="mt-2 text-sm font-bold text-white">{s.t}</h3>
              <p className="mt-1.5 text-xs text-slate-500">{s.d}</p>
              {i < 3 && (
                <Icon
                  name="send"
                  size={16}
                  className="absolute right-4 top-5 hidden rotate-90 text-cyan-500/40 lg:block"
                />
              )}
            </div>
          ))}
        </div>
        {/* flow */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-2 text-center sm:gap-3">
          {["User", "WATER AI CLOUD", "WhatsApp Connection", "Bot Engine", "User Messages"].map(
            (f, i, arr) => (
              <div key={f} className="flex items-center gap-2 sm:gap-3">
                <div className="glass rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-200">
                  {f}
                </div>
                {i < arr.length - 1 && (
                  <span className="text-cyan-500/60">
                    <span className="hidden sm:inline">→</span>
                    <span className="sm:hidden">↓</span>
                  </span>
                )}
              </div>
            )
          )}
        </div>
      </section>

      {/* 6. Pricing */}
      <section id="pricing" className="mx-auto max-w-7xl scroll-mt-24 px-4 py-20 sm:px-6">
        <div className="mb-12 text-center">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-cyan-400">Pricing</p>
          <h2 className="font-display text-3xl font-bold text-white sm:text-4xl">
            Harga transparan, <span className="text-gradient">naik kelas kapan saja</span>
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-slate-400">
            Semua paket termasuk dashboard, REST API, dan engine 24/7. Harga dapat dikonfigurasi oleh admin.
          </p>
        </div>
        <PricingCards plans={plans.length ? plans : []} />
        {plans.length === 0 && (
          <p className="mt-6 text-center text-sm text-slate-500">
            Pricing sedang dimuat dari server.
          </p>
        )}
      </section>

      {/* 7. Developer / API */}
      <section id="api" className="mx-auto max-w-7xl scroll-mt-24 px-4 py-20 sm:px-6">
        <div className="grid items-start gap-10 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-cyan-400">Developer API</p>
            <h2 className="font-display text-3xl font-bold text-white sm:text-4xl">
              API yang dibuat untuk <span className="text-gradient">developer</span>
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-slate-400">
              Autentikasi Bearer token, permission per key, IP whitelist, rate limit, dan format
              error yang konsisten. Uji endpoint langsung dari{" "}
              <Link href="/docs/playground" className="text-cyan-400 underline underline-offset-2">
                Playground
              </Link>{" "}
              tanpa install apa pun.
            </p>
            <div className="mt-6 space-y-1.5">
              {ENDPOINTS.map(([m, p]) => (
                <div
                  key={p}
                  className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 font-mono text-[11px] text-slate-300"
                >
                  <Badge tone={METHOD_TONE[m] ?? "slate"}>{m}</Badge>
                  <span className="truncate">{p}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-4">
            <CodeTabs />
            <Link href="/docs" className="btn btn-ghost w-full !py-2.5">
              <Icon name="doc" size={14} />
              Baca dokumentasi lengkap
            </Link>
          </div>
        </div>
      </section>

      {/* 8. System status */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="card p-6 sm:p-8">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-400" />
              </span>
              <h2 className="font-display text-lg font-bold text-white">
                All systems operational
              </h2>
            </div>
            <Link href="/status" className="text-xs font-semibold text-cyan-400 hover:underline">
              Lihat detail status →
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {statusItems.map((s) => (
              <div key={s.name} className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-3 text-center">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">{s.name}</p>
                <p className={`mt-1 text-xs font-bold ${s.value === "operational" ? "text-emerald-400" : "text-amber-400"}`}>
                  {s.value === "operational" ? "● Operational" : s.value}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 9. FAQ */}
      <section id="faq" className="mx-auto max-w-7xl scroll-mt-24 px-4 py-20 sm:px-6">
        <div className="mb-10 text-center">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-cyan-400">FAQ</p>
          <h2 className="font-display text-3xl font-bold text-white sm:text-4xl">
            Pertanyaan <span className="text-gradient">sering diajukan</span>
          </h2>
        </div>
        <Faq />
      </section>

      {/* 10. CTA */}
      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <div className="card glow-ring relative overflow-hidden p-8 text-center sm:p-14">
          <div className="pointer-events-none absolute inset-0 hero-glow" aria-hidden />
          <h2 className="relative font-display text-3xl font-bold text-white sm:text-4xl">
            Siap merakit bot WhatsApp Anda?
          </h2>
          <p className="relative mx-auto mt-3 max-w-md text-sm text-slate-400">
            Gratis untuk 1 bot. Upgrade kapan pun Anda butuh lebih banyak.
          </p>
          <div className="relative mt-7 flex flex-wrap justify-center gap-3">
            <Link href="/register" className="btn btn-primary !px-7 !py-3">
              Mulai Gratis
            </Link>
            <Link href="/docs/playground" className="btn btn-ghost !px-7 !py-3">
              Coba Playground API
            </Link>
          </div>
        </div>
      </section>

      {/* 11. Footer */}
      <footer className="border-t border-white/5 bg-ink-900/60">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
          <div>
            <Logo size={30} />
            <p className="mt-3 max-w-xs text-xs leading-relaxed text-slate-500">
              "Powerful WhatsApp Automation, Built for Everyone."
            </p>
          </div>
          <div>
            <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">Platform</h4>
            <ul className="space-y-2 text-sm text-slate-500">
              <li><Link href="/#features" className="hover:text-cyan-300">Features</Link></li>
              <li><Link href="/#pricing" className="hover:text-cyan-300">Pricing</Link></li>
              <li><Link href="/#api" className="hover:text-cyan-300">API</Link></li>
              <li><Link href="/status" className="hover:text-cyan-300">Status</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">Resources</h4>
            <ul className="space-y-2 text-sm text-slate-500">
              <li><Link href="/docs" className="hover:text-cyan-300">Documentation</Link></li>
              <li><Link href="/docs/playground" className="hover:text-cyan-300">API Playground</Link></li>
              <li><Link href="/login" className="hover:text-cyan-300">Login</Link></li>
              <li><Link href="/register" className="hover:text-cyan-300">Get Started</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">Support</h4>
            <ul className="space-y-2 text-sm text-slate-500">
              <li><Link href="/dashboard/support" className="hover:text-cyan-300">Buka Ticket</Link></li>
              <li><Link href="/#faq" className="hover:text-cyan-300">FAQ</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/5 px-4 py-5 text-center text-[11px] text-slate-600">
          © 2026 WATER AI CLOUD. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
