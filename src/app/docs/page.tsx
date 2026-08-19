import Link from "next/link";
import { Logo } from "@/components/logo";
import { CodeTabs } from "@/components/landing";

export const metadata = { title: "Documentation" };
export const dynamic = "force-dynamic";

const SECTIONS = [
  { id: "introduction", label: "Introduction" },
  { id: "authentication", label: "Authentication" },
  { id: "api-keys", label: "API Keys" },
  { id: "send-message", label: "Send Message" },
  { id: "media", label: "Media" },
  { id: "bots", label: "Bots" },
  { id: "webhooks", label: "Webhooks" },
  { id: "events", label: "Events" },
  { id: "errors", label: "Errors" },
  { id: "examples", label: "Examples" },
];

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="scroll-mt-24 border-b border-white/5 pb-3 font-display text-xl font-bold text-white">
      {children}
    </h2>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-xl border border-white/10 bg-[#07090c] p-4 text-[12px] leading-relaxed text-slate-300">
      <code>{children}</code>
    </pre>
  );
}

function Row({ method, path, desc }: { method: string; path: string; desc: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 sm:flex-row sm:items-center sm:gap-3">
      <code className="shrink-0 font-mono text-[11px] text-cyan-300">
        <b className="text-slate-400">{method.padEnd(6)}</b>{path}
      </code>
      <span className="text-[11px] text-slate-500">{desc}</span>
    </div>
  );
}

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-ink-950">
      <header className="sticky top-0 z-30 border-b border-white/5 bg-ink-950/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/"><Logo size={24} /></Link>
          <div className="flex items-center gap-3 text-xs">
            <Link href="/" className="text-slate-400 hover:text-white">Home</Link>
            <Link href="/docs/playground" className="btn btn-primary !px-4 !py-1.5 !text-[11px]">
              Open Playground
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[210px_1fr]">
        {/* sidebar */}
        <aside className="hidden lg:block">
          <nav className="sticky top-20 space-y-1">
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="block rounded-lg px-3 py-2 text-[13px] text-slate-400 transition hover:bg-white/5 hover:text-white"
              >
                {s.label}
              </a>
            ))}
          </nav>
        </aside>

        {/* content */}
        <main className="min-w-0 space-y-10">
          <section>
            <H2 id="introduction">Introduction</H2>
            <p className="text-sm leading-relaxed text-slate-400">
              WATER AI CLOUD REST API memungkinkan Anda mengontrol bot WhatsApp, mengirim pesan,
              dan mengelola webhook secara programatik. Base URL endpoint Anda adalah
              <code className="mx-1 rounded bg-white/5 px-1.5 py-0.5 text-[11px] text-cyan-300">https://{process.env.APP_URL?.replace("https://", "") || "your-domain"}/api/v1</code>
            </p>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              Semua respons menggunakan format konsisten:{" "}
              <code className="rounded bg-white/5 px-1.5 py-0.5 text-[11px] text-emerald-300">{`{ "success": true, "data": ... }`}</code>{" "}
              atau{" "}
              <code className="rounded bg-white/5 px-1.5 py-0.5 text-[11px] text-red-300">{`{ "success": false, "error": { "code", "message" } }`}</code>.
            </p>
            <div className="mt-4 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4 text-[12px] leading-relaxed text-cyan-200">
              💡 Coba semua endpoint langsung dari <Link className="underline" href="/docs/playground">API Playground</Link> —
              request dikirim benar-benar ke backend, lengkap dengan status code & response time.
            </div>
          </section>

          <section>
            <H2 id="authentication">Authentication</H2>
            <p className="text-sm text-slate-400">
              Setiap request harus menyertakan API key di header <code className="text-cyan-300">Authorization</code>:
            </p>
            <div className="mt-3">
              <Code>{`curl https://your-domain/api/v1/bot/status \\
  -H "Authorization: Bearer WAC_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"`}</Code>
            </div>
            <p className="mt-3 text-sm text-slate-400">
              API key dibuat di dashboard (menu <b>API Keys</b>). Server hanya menyimpan hash (SHA-256) dari key.
              Rate limit default: <b>60 request/menit per key</b>. Key dapat dibatasi oleh IP whitelist & permission.
            </p>
          </section>

          <section>
            <H2 id="api-keys">API Keys & Permissions</H2>
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full text-left text-[12px]">
                <thead className="bg-white/[0.03] text-[10px] uppercase tracking-wider text-slate-500">
                  <tr><th className="px-4 py-2.5">Permission</th><th className="px-4 py-2.5">Akses</th></tr>
                </thead>
                <tbody className="text-slate-400">
                  <tr className="border-t border-white/5"><td className="px-4 py-2.5 font-mono text-cyan-300">messages.send</td><td className="px-4 py-2.5">Kirim semua jenis pesan</td></tr>
                  <tr className="border-t border-white/5"><td className="px-4 py-2.5 font-mono text-cyan-300">messages.read</td><td className="px-4 py-2.5">Baca data pesan</td></tr>
                  <tr className="border-t border-white/5"><td className="px-4 py-2.5 font-mono text-cyan-300">bots.read</td><td className="px-4 py-2.5">Lihat daftar bot & status</td></tr>
                  <tr className="border-t border-white/5"><td className="px-4 py-2.5 font-mono text-cyan-300">bots.manage</td><td className="px-4 py-2.5">Buat / hapus bot</td></tr>
                  <tr className="border-t border-white/5"><td className="px-4 py-2.5 font-mono text-cyan-300">webhooks.manage</td><td className="px-4 py-2.5">Buat webhook via API</td></tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <H2 id="send-message">Send Message</H2>
            <p className="text-sm text-slate-400">Kirim pesan ke nomor/JID WhatsApp. Parameter <code className="text-cyan-300">botId</code> opsional (default: bot pertama / bot yang di-scope key).</p>
            <div className="mt-3 space-y-1.5">
              <Row method="POST" path="/api/v1/messages/text" desc='body: { to, text }' />
              <Row method="POST" path="/api/v1/messages/image" desc='body: { to, url, caption? }' />
              <Row method="POST" path="/api/v1/messages/video" desc='body: { to, url, caption? }' />
              <Row method="POST" path="/api/v1/messages/audio" desc='body: { to, url }' />
              <Row method="POST" path="/api/v1/messages/document" desc='body: { to, url, fileName? }' />
              <Row method="POST" path="/api/v1/messages/contact" desc='body: { to, contact: { name, phone } }' />
              <Row method="POST" path="/api/v1/messages/location" desc='body: { to, location: { latitude, longitude, label? } }' />
            </div>
            <div className="mt-4">
              <Code>{`POST /api/v1/messages/text
{
  "botId": "uuid-bot (opsional)",
  "to": "6281234567890@s.whatsapp.net",
  "text": "Halo dari WATER AI CLOUD!"
}

// 200 OK
{ "success": true, "data": { "sent": true, "to": "...", "type": "text" } }`}</Code>
            </div>
          </section>

          <section>
            <H2 id="media">Media</H2>
            <p className="text-sm leading-relaxed text-slate-400">
              Untuk image/video/audio/document, server kami mengunduh file dari <code className="text-cyan-300">url</code> lalu
              mengirimnya via WhatsApp (Baileys). Pastikan URL dapat diakses publik. Contoh:
            </p>
            <div className="mt-3">
              <Code>{`POST /api/v1/messages/image
{
  "to": "6281234567890@s.whatsapp.net",
  "url": "https://cdn.example.com/poster.png",
  "caption": "Poster event"
}`}</Code>
            </div>
          </section>

          <section>
            <H2 id="bots">Bots</H2>
            <div className="space-y-1.5">
              <Row method="GET" path="/api/v1/bot/status" desc="Status bot key (status, uptime, WA number, engine)" />
              <Row method="GET" path="/api/v1/bots" desc="Daftar bot milik akun" />
              <Row method="POST" path="/api/v1/bots" desc='body: { name, prefix?, ownerNumber?, description? }' />
              <Row method="DELETE" path="/api/v1/bots/{id}" desc="Hapus bot (engine berhenti, sesi dibersihkan)" />
            </div>
          </section>

          <section>
            <H2 id="webhooks">Webhooks</H2>
            <p className="text-sm leading-relaxed text-slate-400">
              Daftarkan URL untuk menerima event. Setiap delivery adalah POST JSON dengan header
              <code className="mx-1 text-cyan-300">x-water-event</code> dan{" "}
              <code className="mx-1 text-cyan-300">x-water-signature</code> (HMAC-SHA256 hex dari raw body,
              secret = webhook secret Anda). Gagal 2xx? Sistem retry 3x (0s, 1s, 5s).
            </p>
            <div className="mt-3">
              <Code>{`POST /api/v1/webhooks
{
  "url": "https://example.com/hook",
  "events": ["message.received", "bot.connected"]
}

// payload yang diterima:
{
  "event": "message.received",
  "source": "water-ai-cloud",
  "timestamp": "2026-01-01T00:00:00Z",
  "data": { "botId": "...", "chat": "...", "sender": "...", "text": "halo" }
}

// verifikasi signature (Node.js)
const ok = crypto.createHmac("sha256", WEBHOOK_SECRET).update(rawBody).digest("hex") === req.headers["x-water-signature"];`}</Code>
            </div>
          </section>

          <section>
            <H2 id="events">Events</H2>
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full text-left text-[12px]">
                <thead className="bg-white/[0.03] text-[10px] uppercase tracking-wider text-slate-500">
                  <tr><th className="px-4 py-2.5">Event</th><th className="px-4 py-2.5">Kapan</th></tr>
                </thead>
                <tbody className="text-slate-400">
                  <tr className="border-t border-white/5"><td className="px-4 py-2 font-mono text-cyan-300">message.received</td><td className="px-4 py-2">Pesan masuk ke bot (semua tipe)</td></tr>
                  <tr className="border-t border-white/5"><td className="px-4 py-2 font-mono text-cyan-300">message.sent</td><td className="px-4 py-2">Pesan keluar terkirim</td></tr>
                  <tr className="border-t border-white/5"><td className="px-4 py-2 font-mono text-cyan-300">message.failed</td><td className="px-4 py-2">Pesan gagal dikirim</td></tr>
                  <tr className="border-t border-white/5"><td className="px-4 py-2 font-mono text-cyan-300">bot.connected</td><td className="px-4 py-2">WhatsApp terhubung</td></tr>
                  <tr className="border-t border-white/5"><td className="px-4 py-2 font-mono text-cyan-300">bot.disconnected</td><td className="px-4 py-2">WhatsApp terputus / logged out</td></tr>
                  <tr className="border-t border-white/5"><td className="px-4 py-2 font-mono text-cyan-300">bot.started</td><td className="px-4 py-2">Engine bot dimulai</td></tr>
                  <tr className="border-t border-white/5"><td className="px-4 py-2 font-mono text-cyan-300">bot.stopped</td><td className="px-4 py-2">Engine bot dihentikan</td></tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <H2 id="errors">Errors</H2>
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full text-left text-[12px]">
                <thead className="bg-white/[0.03] text-[10px] uppercase tracking-wider text-slate-500">
                  <tr><th className="px-4 py-2.5">HTTP</th><th className="px-4 py-2.5">Code</th><th className="px-4 py-2.5">Arti</th></tr>
                </thead>
                <tbody className="text-slate-400">
                  <tr className="border-t border-white/5"><td className="px-4 py-2">400</td><td className="px-4 py-2 font-mono text-cyan-300">VALIDATION / MISSING_TEXT</td><td className="px-4 py-2">Body tidak valid</td></tr>
                  <tr className="border-t border-white/5"><td className="px-4 py-2">401</td><td className="px-4 py-2 font-mono text-cyan-300">INVALID_KEY / MISSING_KEY</td><td className="px-4 py-2">API key salah / dicabut</td></tr>
                  <tr className="border-t border-white/5"><td className="px-4 py-2">403</td><td className="px-4 py-2 font-mono text-cyan-300">PERMISSION_DENIED / IP_BLOCKED</td><td className="px-4 py-2">Key tidak punya permission / IP tidak di whitelist</td></tr>
                  <tr className="border-t border-white/5"><td className="px-4 py-2">404</td><td className="px-4 py-2 font-mono text-cyan-300">BOT_NOT_FOUND / NO_BOT</td><td className="px-4 py-2">Bot tidak ditemukan</td></tr>
                  <tr className="border-t border-white/5"><td className="px-4 py-2">429</td><td className="px-4 py-2 font-mono text-cyan-300">RATE_LIMITED</td><td className="px-4 py-2">60 req/menit terlampaui</td></tr>
                  <tr className="border-t border-white/5"><td className="px-4 py-2">503</td><td className="px-4 py-2 font-mono text-cyan-300">BOT_OFFLINE</td><td className="px-4 py-2">Bot belum online — start dulu</td></tr>
                  <tr className="border-t border-white/5"><td className="px-4 py-2">502</td><td className="px-4 py-2 font-mono text-cyan-300">SEND_FAILED / MEDIA_FETCH_FAILED</td><td className="px-4 py-2">WhatsApp menolak / media gagal diunduh</td></tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <H2 id="examples">Examples</H2>
            <p className="mb-3 text-sm text-slate-400">Kirim teks multi-bahasa (cURL, JavaScript, Node.js, Python):</p>
            <CodeTabs />
          </section>
        </main>
      </div>
    </div>
  );
}
