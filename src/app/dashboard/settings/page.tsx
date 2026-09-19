"use client";

import { useState } from "react";
import {
  api,
  useApi,
  Icon,
  Button,
  Field,
  ErrorState,
  Spinner,
  toast,
  fmtDate,
  timeAgo,
} from "@/components/ui";

type SessionRow = {
  id: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  expiresAt: string;
};

export default function SettingsPage() {
  const { data, loading, error, reload } = useApi<{
    user: { id: string; username: string; email: string; role: string; plan: string; emailVerified: boolean };
  }>("/dashboard/settings");
  const { data: sessions, reload: reloadSessions } = useApi<SessionRow[]>("/dashboard/sessions");

  const [username, setUsername] = useState("");
  const [pw, setPw] = useState({ current: "", next: "" });
  const [busy, setBusy] = useState<string | null>(null);

  const saveProfile = async () => {
    setBusy("profile");
    try {
      await api("/dashboard/settings/update", "POST", { username: username || undefined });
      toast("Profil disimpan");
      reload();
    } catch (e: any) {
      toast(e.message, undefined, "err");
    } finally {
      setBusy(null);
    }
  };

  const changePw = async () => {
    setBusy("password");
    try {
      await api("/dashboard/settings/update", "POST", {
        currentPassword: pw.current,
        password: pw.next,
      });
      toast("Password diubah");
      setPw({ current: "", next: "" });
    } catch (e: any) {
      toast(e.message, undefined, "err");
    } finally {
      setBusy(null);
    }
  };

  const revokeSession = async (id: string) => {
    try {
      await api(`/dashboard/sessions/${id}/revoke`, "POST");
      toast("Sesi di-revoke");
      reloadSessions();
    } catch (e: any) {
      toast(e.message, undefined, "err");
    }
  };

  if (loading && !data)
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-slate-500">
        <Spinner size={22} />
        <p className="text-xs">Memuat settings...</p>
      </div>
    );
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-lg font-bold text-white">Settings</h2>
        <p className="text-xs text-slate-500">Profil, password, dan manajemen sesi login.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h3 className="mb-4 text-sm font-bold text-white">Profile</h3>
          <div className="space-y-4">
            <Field label="Username">
              <input className="input" value={username || data.user.username} onChange={(e) => setUsername(e.target.value)} />
            </Field>
            <Field label="Email">
              <div className="flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2.5">
                <span className="text-xs text-slate-400">{data.user.email}</span>
                <span className={`text-[10px] font-bold ${data.user.emailVerified ? "text-emerald-400" : "text-amber-400"}`}>
                  {data.user.emailVerified ? "TERVERIFIKASI" : "BELUM"}
                </span>
              </div>
            </Field>
            <div className="flex gap-4 text-[11px] text-slate-500">
              <span>Role: <b className="text-cyan-300">{data.user.role}</b></span>
              <span>Plan: <b className="text-cyan-300">{data.user.plan}</b></span>
            </div>
            <Button loading={busy === "profile"} onClick={saveProfile}>
              Simpan Profil
            </Button>
          </div>
        </div>

        <div className="card p-5">
          <h3 className="mb-4 text-sm font-bold text-white">Change Password</h3>
          <div className="space-y-4">
            <Field label="Password Saat Ini">
              <input className="input" type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
            </Field>
            <Field label="Password Baru" hint="Minimal 8 karakter.">
              <input className="input" type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
            </Field>
            <Button loading={busy === "password"} onClick={changePw} disabled={!pw.current || !pw.next}>
              Ganti Password
            </Button>
          </div>
        </div>
      </div>

      <div className="card p-5">
        <h3 className="mb-1 text-sm font-bold text-white">Active Sessions</h3>
        <p className="mb-4 text-[11px] text-slate-500">
          Token sesi disimpan ter-hash di server (7 hari). Revoke sesi yang tidak Anda kenali.
        </p>
        {(sessions ?? []).length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-600">Tidak ada sesi.</p>
        ) : (
          <div className="space-y-2">
            {(sessions ?? []).map((s) => (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Icon name="cpu" size={16} className="shrink-0 text-slate-500" />
                  <div className="min-w-0">
                    <p className="truncate text-xs text-slate-300">{s.userAgent || "Perangkat tidak diketahui"}</p>
                    <p className="text-[10px] text-slate-600">
                      IP {s.ip ?? "?"} · mulai {timeAgo(s.createdAt)} · expire {fmtDate(s.expiresAt)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => revokeSession(s.id)}
                  className="rounded-lg px-3 py-1.5 text-[11px] font-semibold text-red-400 transition hover:bg-red-500/10"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
