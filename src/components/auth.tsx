"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Logo } from "./logo";
import { Button, Field, Icon, api, ApiErrorC } from "./ui";

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="auth-scope relative flex min-h-screen items-center justify-center bg-gradient-to-b from-[#0c141f] via-[#0a111b] to-[#070d15] px-4 py-10">
      <div className="grid-bg-bright pointer-events-none absolute inset-x-0 top-0 h-[520px]" aria-hidden />
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-cyan-500/20 blur-[120px]" aria-hidden />
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Link href="/" className="drop-shadow-[0_0_18px_rgba(34,211,238,0.35)]">
            <Logo size={36} />
          </Link>
        </div>
        <div className="auth-card anim-fade-up rounded-2xl p-6 sm:p-8">
          <h1 className="font-display text-2xl font-bold text-white">{title}</h1>
          <p className="mt-1.5 text-sm text-slate-300">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>
        <p className="mt-6 text-center text-xs text-slate-400">
          © 2026 WATER AI CLOUD. All rights reserved.
        </p>
      </div>
    </div>
  );
}

function Err({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/20 px-3.5 py-3 text-[13px] font-medium leading-relaxed text-red-200">
      <Icon name="alert" size={15} className="mt-0.5 shrink-0 text-red-300" />
      {msg}
    </div>
  );
}

/* --------------------------------- LOGIN --------------------------------- */
export function LoginForm() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api("/auth/login", "POST", { identifier, password });
      router.push("/dashboard");
    } catch (e2: any) {
      setErr(e2 instanceof ApiErrorC ? e2.message : "Terjadi kesalahan. Coba lagi.");
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Welcome back" subtitle="Login ke WATER AI CLOUD untuk melanjutkan.">
      <form onSubmit={submit} className="space-y-4">
        <Err msg={err} />
        <Field label="Email atau Username">
          <input className="input" value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="you@example.com" required autoComplete="username" />
        </Field>
        <Field label="Password">
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required autoComplete="current-password" />
        </Field>
        <Button type="submit" loading={busy} className="w-full !py-2.5">
          {busy ? "Connecting..." : "Login"}
        </Button>
      </form>
      <div className="mt-5 flex items-center justify-between text-xs">
        <Link href="/forgot" className="text-cyan-400 hover:underline">
          Lupa password?
        </Link>
        <Link href="/register" className="text-slate-400 hover:text-white">
          Belum punya akun? <b className="text-cyan-300">Daftar</b>
        </Link>
      </div>
    </AuthShell>
  );
}

/* -------------------------------- REGISTER ------------------------------- */
export function RegisterForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [verifyLink, setVerifyLink] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const d = await api<{ user: any; verifyLink: string }>("/auth/register", "POST", {
        username,
        email,
        password,
      });
      setVerifyLink(d.verifyLink);
      setTimeout(() => router.push("/dashboard"), 2500);
    } catch (e2: any) {
      setErr(e2 instanceof ApiErrorC ? e2.message : "Terjadi kesalahan. Coba lagi.");
      setBusy(false);
    }
  };

  if (verifyLink) {
    return (
      <AuthShell title="Akun dibuat 🎉" subtitle="Anda sudah login.">
        <div className="space-y-4">
          <div className="rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-3 py-3 text-xs text-cyan-200">
            <p className="mb-1 font-semibold">Verifikasi email (opsional)</p>
            Environment ini belum menyambungkan SMTP, jadi tautan verifikasi ditampilkan di sini
            (di production dikirim ke <b>{email}</b>):
            <a href={verifyLink} className="mt-2 block break-all font-mono text-[11px] text-cyan-300 underline">
              {verifyLink}
            </a>
          </div>
          <Button className="w-full !py-2.5" onClick={() => router.push("/dashboard")}>
            Buka Dashboard
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Create your account" subtitle="Gratis untuk 1 bot. Tanpa kartu kredit.">
      <form onSubmit={submit} className="space-y-4">
        <Err msg={err} />
        <Field label="Username">
          <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="water_dev" required minLength={3} maxLength={32} />
        </Field>
        <Field label="Email">
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
        </Field>
        <Field label="Password" hint="Minimal 8 karakter.">
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={8} autoComplete="new-password" />
        </Field>
        <Button type="submit" loading={busy} className="w-full !py-2.5">
          {busy ? "Membuat akun..." : "Daftar Gratis"}
        </Button>
      </form>
      <p className="mt-5 text-center text-xs text-slate-400">
        Sudah punya akun?{" "}
        <Link href="/login" className="font-semibold text-cyan-300 hover:underline">
          Login
        </Link>
      </p>
    </AuthShell>
  );
}

/* -------------------------------- FORGOT -------------------------------- */
export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ message: string; resetLink: string | null } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const d = await api<{ message: string; resetLink: string | null }>("/auth/forgot", "POST", { email });
      setResult(d);
    } catch (e2: any) {
      setErr(e2 instanceof ApiErrorC ? e2.message : "Terjadi kesalahan.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Forgot password" subtitle="Masukkan email akun Anda untuk membuat link reset.">
      {result ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-3 py-3 text-xs text-cyan-200">
            {result.message}
            {result.resetLink && (
              <a
                href={result.resetLink}
                className="mt-2 block break-all font-mono text-[11px] text-cyan-300 underline"
              >
                {result.resetLink}
              </a>
            )}
          </div>
          <Link href="/login" className="btn btn-ghost w-full !py-2.5">
            Kembali ke Login
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Err msg={err} />
          <Field label="Email">
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
          </Field>
          <Button type="submit" loading={busy} className="w-full !py-2.5">
            {busy ? "Mengirim..." : "Kirim Link Reset"}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

/* --------------------------------- RESET --------------------------------- */
export function ResetForm() {
  const params = useSearchParams();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setErr("Konfirmasi password tidak sama.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api("/auth/reset", "POST", { token: params.get("token") ?? "", password });
      router.push("/login");
    } catch (e2: any) {
      setErr(e2 instanceof ApiErrorC ? e2.message : "Terjadi kesalahan.");
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Reset password" subtitle="Buat password baru untuk akun Anda.">
      <form onSubmit={submit} className="space-y-4">
        <Err msg={err} />
        <Field label="Password Baru" hint="Minimal 8 karakter.">
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        </Field>
        <Field label="Konfirmasi Password">
          <input className="input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </Field>
        <Button type="submit" loading={busy} className="w-full !py-2.5">
          {busy ? "Menyimpan..." : "Simpan Password Baru"}
        </Button>
      </form>
    </AuthShell>
  );
}

/* --------------------------------- VERIFY -------------------------------- */
export function VerifyPage() {
  const params = useSearchParams();
  const [state, setState] = useState<"loading" | "ok" | "err">("loading");
  useEffect(() => {
    (async () => {
      try {
        await api("/auth/verify", "POST", { token: params.get("token") ?? "" });
        setState("ok");
      } catch {
        setState("err");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <AuthShell
      title={state === "ok" ? "Email terverifikasi" : state === "err" ? "Token tidak valid" : "Memverifikasi..."}
      subtitle={
        state === "ok"
          ? "Email Anda telah dikonfirmasi. Anda bisa lanjut ke dashboard."
          : state === "err"
            ? "Token sudah dipakai atau kedaluwarsa."
            : "Sebentar..."
      }
    >
      {state !== "loading" && (
        <Link href="/login" className="btn btn-primary w-full !py-2.5">
          {state === "ok" ? "Buka Dashboard" : "Kembali ke Login"}
        </Link>
      )}
    </AuthShell>
  );
}
