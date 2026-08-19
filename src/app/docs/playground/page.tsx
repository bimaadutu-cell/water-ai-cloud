"use client";

import Link from "next/link";
import { useState } from "react";
import { Logo } from "@/components/logo";
import { Button, Field, Icon, Spinner } from "@/components/ui";

const ENDPOINTS: { method: string; path: string; desc: string; body?: string }[] = [
  { method: "GET", path: "/api/v1/bot/status", desc: "Status bot (butuh permission bots.read)" },
  { method: "GET", path: "/api/v1/bots", desc: "Daftar bot (bots.read)" },
  {
    method: "POST",
    path: "/api/v1/bots",
    desc: "Buat bot (bots.manage)",
    body: '{\n  "name": "bot-dari-playground",\n  "prefix": "!",\n  "ownerNumber": "6281234567890"\n}',
  },
  {
    method: "POST",
    path: "/api/v1/messages/text",
    desc: "Kirim teks (messages.send)",
    body: '{\n  "to": "6281234567890@s.whatsapp.net",\n  "text": "Halo dari playground WATER AI CLOUD!"\n}',
  },
  {
    method: "POST",
    path: "/api/v1/messages/location",
    desc: "Kirim lokasi (messages.send)",
    body: '{\n  "to": "6281234567890@s.whatsapp.net",\n  "location": {\n    "latitude": -6.2088,\n    "longitude": 106.8456,\n    "label": "Jakarta"\n  }\n}',
  },
  {
    method: "POST",
    path: "/api/v1/webhooks",
    desc: "Daftarkan webhook (webhooks.manage)",
    body: '{\n  "url": "https://example.com/hook",\n  "events": ["message.received"]\n}',
  },
];

export default function PlaygroundPage() {
  const [idx, setIdx] = useState(0);
  const ep = ENDPOINTS[idx];
  const [method, setMethod] = useState(ep.method);
  const [key, setKey] = useState("");
  const [body, setBody] = useState(ep.body ?? "");
  const [res, setRes] = useState<{
    status: number;
    statusText: string;
    timeMs: number;
    headers: [string, string][];
    body: string;
  } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const pick = (i: number) => {
    setIdx(i);
    setMethod(ENDPOINTS[i].method);
    setBody(ENDPOINTS[i].body ?? "");
    setRes(null);
    setErr(null);
  };

  const send = async () => {
    setSending(true);
    setErr(null);
    setRes(null);
    const t0 = performance.now();
    try {
      const headers: Record<string, string> = {};
      if (method === "POST") headers["content-type"] = "application/json";
      if (key.trim()) headers["authorization"] = `Bearer ${key.trim()}`;
      const res = await fetch(ep.path, {
        method,
        headers,
        body: method === "POST" && body.trim() ? body : undefined,
      });
      const timeMs = Math.round(performance.now() - t0);
      const text = await res.text();
      let pretty = text;
      try {
        pretty = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        /* keep raw */
      }
      const hdrs: [string, string][] = [];
      res.headers.forEach((v, k) => hdrs.push([k, v]));
      setRes({ status: res.status, statusText: res.statusText, timeMs, headers: hdrs, body: pretty });
    } catch (e: any) {
      setErr(e.message ?? "Request gagal — periksa koneksi.");
    } finally {
      setSending(false);
    }
  };

  const tone = res
    ? res.status < 300
      ? "text-emerald-400"
      : res.status < 500
        ? "text-amber-400"
        : "text-red-400"
    : "";

  return (
    <div className="min-h-screen bg-ink-950">
      <header className="sticky top-0 z-30 border-b border-white/5 bg-ink-950/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Link href="/"><Logo size={24} /></Link>
            <span className="hidden text-xs text-slate-500 sm:inline">/ docs / playground</span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <Link href="/docs" className="text-slate-400 hover:text-white">← Docs</Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-5 px-4 py-8 sm:px-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">API Playground</h1>
          <p className="mt-1 text-xs text-slate-500">
            Request dikirim <b>benar-benar ke backend</b> Anda — bukan simulasi. Status code, response time, dan header
            asli ditampilkan.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
          {/* endpoint list */}
          <div className="card h-fit p-3">
            <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-wider text-slate-600">Endpoints</p>
            <div className="space-y-1">
              {ENDPOINTS.map((e, i) => (
                <button
                  key={e.method + e.path}
                  onClick={() => pick(i)}
                  className={`w-full rounded-lg border px-3 py-2.5 text-left transition ${
                    i === idx ? "border-cyan-500/40 bg-cyan-500/10" : "border-transparent hover:bg-white/5"
                  }`}
                >
                  <p className="font-mono text-[11px]">
                    <b className={e.method === "GET" ? "text-cyan-300" : e.method === "DELETE" ? "text-red-400" : "text-emerald-400"}>
                      {e.method}
                    </b>{" "}
                    <span className="text-slate-300">{e.path.replace("/api/v1", "")}</span>
                  </p>
                  <p className="mt-0.5 text-[10px] text-slate-600">{e.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* request builder */}
          <div className="space-y-4">
            <div className="card p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="sm:w-28">
                  <Field label="Method">
                    <select className="input" value={method} onChange={(e) => setMethod(e.target.value)} disabled>
                      <option>{ep.method}</option>
                    </select>
                  </Field>
                </div>
                <div className="flex-1">
                  <Field label="URL (base: server Anda)">
                    <div className="flex items-center gap-2">
                      <code className="input flex-1 !text-[11px] text-cyan-300">{ep.path}</code>
                    </div>
                  </Field>
                </div>
              </div>
              <div className="mt-4">
                <Field label="API Key (Authorization: Bearer)" hint="Kosongkan untuk melihat error 401 asli dari gateway.">
                  <input className="input font-mono !text-[11px]" placeholder="WAC_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" value={key} onChange={(e) => setKey(e.target.value)} />
                </Field>
              </div>
              {ep.method === "POST" && (
                <div className="mt-4">
                  <Field label="Body (JSON)">
                    <textarea
                      className="input min-h-36 font-mono !text-[11px] leading-relaxed"
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      spellCheck={false}
                    />
                  </Field>
                </div>
              )}
              <Button className="mt-5 w-full !py-2.5" loading={sending} onClick={send}>
                <Icon name="send" size={14} />
                {sending ? "Mengirim request..." : "Send Request"}
              </Button>
            </div>

            {/* response */}
            {err && (
              <div className="card border-red-500/25 bg-red-500/5 p-4 text-xs text-red-300">
                <b>Request gagal:</b> {err}
              </div>
            )}
            {res && (
              <div className="card overflow-hidden">
                <div className="flex flex-wrap items-center gap-4 border-b border-white/5 bg-white/[0.02] px-4 py-3">
                  <span className={`font-display text-sm font-bold ${tone}`}>
                    {res.status} {res.statusText}
                  </span>
                  <span className="text-[11px] text-slate-500">⏱ {res.timeMs} ms</span>
                  <span className="text-[11px] text-slate-600">{res.headers.length} headers</span>
                </div>
                <div className="border-b border-white/5">
                  <p className="px-4 pt-3 text-[10px] font-bold uppercase tracking-wider text-slate-600">Response Headers</p>
                  <div className="max-h-32 overflow-y-auto px-4 pb-3">
                    {res.headers.map(([k, v]) => (
                      <p key={k} className="font-mono text-[10px] text-slate-500">
                        <span className="text-cyan-500/70">{k}:</span> {v}
                      </p>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="px-4 pt-3 text-[10px] font-bold uppercase tracking-wider text-slate-600">Response Body</p>
                  <pre className="max-h-80 overflow-auto px-4 pb-4 pt-2 font-mono text-[11px] leading-relaxed text-slate-300">
                    {res.body || "(kosong)"}
                  </pre>
                </div>
              </div>
            )}
            {!res && !err && !sending && (
              <div className="card flex flex-col items-center gap-2 border-dashed py-10 text-slate-600">
                <Icon name="bolt" size={26} />
                <p className="text-xs">Response akan tampil di sini setelah Anda mengirim request.</p>
              </div>
            )}
            {sending && (
              <div className="card flex items-center justify-center gap-3 py-8 text-slate-500">
                <Spinner size={18} />
                <p className="text-xs">Mengirim request ke backend...</p>
              </div>
            )}
          </div>
        </div>

        <div className="card p-4 text-[11px] leading-relaxed text-slate-500">
          <b className="text-slate-300">Catatan:</b> request tanpa key akan mengembalikan 401{" "}
          <code className="text-cyan-400">MISSING_KEY</code>; key tanpa permission mengembalikan 403{" "}
          <code className="text-cyan-400">PERMISSION_DENIED</code>; kirim pesan ke bot yang belum online
          mengembalikan 503 <code className="text-cyan-400">BOT_OFFLINE</code>. Semua itu respons asli dari gateway.
        </div>
      </main>
    </div>
  );
}
