"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Logo } from "./logo";
import { Icon, ToastHost, toast, api } from "./ui";

type User = { username: string; email: string; role: string; plan: string };

const NAV: { group: string; items: { href: string; label: string; icon: string; external?: boolean }[] }[] = [
  {
    group: "Main",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "home" },
      { href: "/dashboard/bots", label: "My Bots", icon: "bot" },
      { href: "/dashboard/whatsapp", label: "WhatsApp", icon: "cloud" },
    ],
  },
  {
    group: "Automation",
    items: [
      { href: "/dashboard/automation", label: "Automation", icon: "bolt" },
      { href: "/dashboard/commands", label: "Commands", icon: "code" },
      { href: "/dashboard/webhooks", label: "Webhooks", icon: "hook" },
    ],
  },
  {
    group: "Developer",
    items: [
      { href: "/dashboard/api-keys", label: "API Keys", icon: "key" },
      { href: "/dashboard/analytics", label: "Analytics", icon: "chart" },
      { href: "/dashboard/logs", label: "Logs", icon: "scroll" },
      { href: "/docs", label: "Documentation", icon: "doc", external: true },
    ],
  },
  {
    group: "Account",
    items: [
      { href: "/dashboard/billing", label: "Billing", icon: "card" },
      { href: "/dashboard/support", label: "Support", icon: "headset" },
      { href: "/dashboard/settings", label: "Settings", icon: "gear" },
    ],
  },
];

const BOTTOM_NAV = [
  { href: "/dashboard", label: "Home", icon: "home", exact: true },
  { href: "/dashboard/bots", label: "Bots", icon: "bot" },
  { href: "/dashboard/whatsapp", label: "WhatsApp", icon: "cloud" },
  { href: "/dashboard/api-keys", label: "API", icon: "key" },
  { href: "/dashboard/settings", label: "Profile", icon: "user" },
];

type Notif = { id: string; type: string; title: string; body: string; read: boolean; createdAt: string };

export default function DashboardShell({ user, children }: { user: User; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawer, setDrawer] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const [serverOk, setServerOk] = useState(true);
  const [userMenu, setUserMenu] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  const loadNotifs = useCallback(async () => {
    try {
      const d = await api<{ notifications: Notif[]; unread: number }>("/dashboard/notifications");
      setNotifs(d.notifications);
      setUnread(d.unread);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    // The effect subscribes to the live dashboard stream and starts the async fetch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadNotifs();
    const es = new EventSource("/api/events/dash");
    esRef.current = es;
    es.addEventListener("stats", () => {});
    es.addEventListener("system", (e) => {
      try {
        const s = JSON.parse(e.data);
        setServerOk(s.database === "operational" && s.website === "operational");
      } catch {
        /* ignore */
      }
    });
    es.addEventListener("bot:status", (e) => {
      const d = JSON.parse(e.data);
      if (d.status === "online") toast("Bot online", "Koneksi WhatsApp berhasil.", "ok");
      else if (d.status === "error") toast("Bot bermasalah", "Reconnect gagal. Cek halaman Bots.", "err");
      else if (d.status === "offline") toast("Bot offline", "Bot dihentikan / terputus.");
      window.dispatchEvent(new CustomEvent("wac:refresh"));
    });
    es.addEventListener("wa:status", (e) => {
      const d = JSON.parse(e.data);
      if (d.status === "connected") toast("WhatsApp terhubung", "Sesi aktif.");
      window.dispatchEvent(new CustomEvent("wac:refresh"));
    });
    es.addEventListener("wa:pairing", (e) => {
      const d = JSON.parse(e.data);
      toast("Pairing code", `Kode: ${d.code}`, "ok");
      window.dispatchEvent(new CustomEvent("wac:refresh"));
    });
    es.addEventListener("notification", (e) => {
      const n = JSON.parse(e.data);
      setNotifs((p) => [
        { id: String(n.at), type: n.type, title: n.title, body: n.body, read: false, createdAt: new Date(n.at).toISOString() },
        ...p,
      ]);
      setUnread((u) => u + 1);
      toast(n.title, n.body);
    });
    return () => es.close();
  }, [loadNotifs]);

  // close drawer on navigation
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDrawer(false);
      setNotifOpen(false);
      setUserMenu(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  const logout = async () => {
    try {
      await api("/auth/logout", "POST");
    } catch {
      /* ignore */
    }
    router.push("/login");
  };

  const markAllRead = async () => {
    await api("/dashboard/notifications/read", "POST");
    setNotifs((p) => p.map((n) => ({ ...n, read: true })));
    setUnread(0);
  };

  const title =
    NAV.flatMap((g) => g.items).find((i) =>
      i.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(i.href)
    )?.label ?? "Dashboard";

  return (
    <div className="min-h-screen bg-ink-950">
      <ToastHost />

      {/* desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-white/5 bg-ink-900/80 backdrop-blur-md lg:flex">
        <div className="flex h-16 items-center border-b border-white/5 px-5">
          <Link href="/dashboard">
            <Logo size={26} />
          </Link>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {NAV.map((g) => (
            <div key={g.group} className="mb-5">
              <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-600">
                {g.group}
              </p>
              {g.items.map((i) => {
                const active =
                  i.href === "/dashboard"
                    ? pathname === "/dashboard"
                    : i.external
                      ? false
                      : pathname.startsWith(i.href);
                return (
                  <Link
                    key={i.href}
                    href={i.href}
                    target={i.external ? "_blank" : undefined}
                    className={`mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition ${
                      active
                        ? "bg-cyan-500/10 text-cyan-300 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.2)]"
                        : "text-slate-400 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <Icon name={i.icon} size={16} />
                    {i.label}
                    {i.external && <span className="ml-auto text-[9px] text-slate-600">↗</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="border-t border-white/5 p-3">
          <div className="flex items-center gap-3 rounded-xl bg-white/[0.03] px-3 py-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500/30 to-blue-600/30 text-xs font-bold text-cyan-200">
              {user.username.slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-white">{user.username}</p>
              <p className="text-[10px] uppercase tracking-wide text-cyan-400/80">{user.plan}</p>
            </div>
            <button onClick={logout} className="text-slate-500 transition hover:text-red-400" title="Logout">
              <Icon name="send" size={14} className="rotate-[135deg]" />
            </button>
          </div>
        </div>
      </aside>

      {/* mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-white/5 bg-ink-950/90 px-4 backdrop-blur-md lg:hidden">
        <button onClick={() => setDrawer(true)} aria-label="Buka menu" className="rounded-lg p-2 text-slate-300">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        <span className="font-display text-sm font-bold text-white">{title}</span>
        <div className="flex items-center gap-1">
          <span
            className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-[9px] font-bold ${
              serverOk ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {serverOk ? "OPERATIONAL" : "DEGRADED"}
          </span>
          <button onClick={() => setNotifOpen(true)} className="relative rounded-lg p-2 text-slate-300" aria-label="Notifikasi">
            <Icon name="bell" size={17} />
            {unread > 0 && (
              <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-cyan-500 px-1 text-[8px] font-bold text-ink-950">
                {unread}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" onClick={() => setDrawer(false)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div
            className="absolute inset-y-0 left-0 flex w-72 flex-col border-r border-white/10 bg-ink-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex h-16 items-center justify-between border-b border-white/5 px-5">
              <Logo size={24} />
              <button onClick={() => setDrawer(false)} className="p-1 text-slate-400">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-3 py-4">
              {NAV.map((g) => (
                <div key={g.group} className="mb-4">
                  <p className="mb-1 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-600">{g.group}</p>
                  {g.items.map((i) => {
                    const active = i.href === "/dashboard" ? pathname === "/dashboard" : i.external ? false : pathname.startsWith(i.href);
                    return (
                      <Link
                        key={i.href}
                        href={i.href}
                        target={i.external ? "_blank" : undefined}
                        className={`mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${
                          active ? "bg-cyan-500/10 text-cyan-300" : "text-slate-400"
                        }`}
                      >
                        <Icon name={i.icon} size={16} />
                        {i.label}
                      </Link>
                    );
                  })}
                </div>
              ))}
            </nav>
            <div className="border-t border-white/5 p-4">
              <button onClick={logout} className="btn btn-danger w-full !py-2 !text-xs">
                Logout — {user.username}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* desktop header */}
      <div className="sticky top-0 z-20 hidden h-16 items-center justify-between border-b border-white/5 bg-ink-950/80 px-8 backdrop-blur-md lg:flex">
        <div>
          <h1 className="font-display text-base font-bold text-white">{title}</h1>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-bold tracking-wide ${
              serverOk ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-400" : "border-amber-500/25 bg-amber-500/10 text-amber-400"
            }`}
          >
            <span className={`pulse-dot h-1.5 w-1.5 rounded-full bg-current ${serverOk ? "" : ""}`} />
            {serverOk ? "SERVER OPERATIONAL" : "SERVER DEGRADED"}
          </span>
          <div className="relative">
            <button
              onClick={() => setNotifOpen((v) => !v)}
              className="relative rounded-lg border border-white/10 bg-white/[0.03] p-2.5 text-slate-300 transition hover:text-white"
              aria-label="Notifikasi"
            >
              <Icon name="bell" size={16} />
              {unread > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-cyan-500 px-1 text-[9px] font-bold text-ink-950">
                  {unread}
                </span>
              )}
            </button>
            {notifOpen && (
              <div className="anim-fade-up absolute right-0 top-12 w-80 overflow-hidden rounded-xl border border-white/10 bg-ink-800 shadow-2xl">
                <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
                  <p className="text-xs font-bold text-white">Notifications</p>
                  {unread > 0 && (
                    <button onClick={markAllRead} className="text-[10px] font-semibold text-cyan-400 hover:underline">
                      Tandai semua dibaca
                    </button>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifs.length === 0 && (
                    <p className="px-4 py-8 text-center text-xs text-slate-500">Belum ada notifikasi.</p>
                  )}
                  {notifs.map((n) => (
                    <div key={n.id} className={`border-b border-white/5 px-4 py-3 ${n.read ? "" : "bg-cyan-500/[0.04]"}`}>
                      <p className="text-xs font-semibold text-slate-200">{n.title}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">{n.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="relative">
            <button
              onClick={() => setUserMenu((v) => !v)}
              className="flex items-center gap-2.5 rounded-lg border border-white/10 bg-white/[0.03] py-1.5 pl-1.5 pr-3 transition hover:border-white/20"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500/30 to-blue-600/30 text-[10px] font-bold text-cyan-200">
                {user.username.slice(0, 2).toUpperCase()}
              </span>
              <span className="text-xs font-semibold text-white">{user.username}</span>
            </button>
            {userMenu && (
              <div className="anim-fade-up absolute right-0 top-12 w-52 overflow-hidden rounded-xl border border-white/10 bg-ink-800 py-1 shadow-2xl">
                <div className="border-b border-white/5 px-4 py-2.5">
                  <p className="text-xs font-semibold text-white">{user.email}</p>
                  <p className="text-[10px] uppercase tracking-wide text-cyan-400">{user.role} · {user.plan}</p>
                </div>
                <Link href="/dashboard/settings" className="flex items-center gap-2 px-4 py-2.5 text-xs text-slate-300 hover:bg-white/5">
                  <Icon name="gear" size={14} /> Settings
                </Link>
                {user.role === "ADMIN" && (
                  <Link href="/admin" className="flex items-center gap-2 px-4 py-2.5 text-xs text-slate-300 hover:bg-white/5">
                    <Icon name="shield" size={14} /> Admin Panel
                  </Link>
                )}
                <button onClick={logout} className="flex w-full items-center gap-2 px-4 py-2.5 text-xs text-red-400 hover:bg-red-500/10">
                  <Icon name="send" size={14} className="rotate-[135deg]" /> Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* mobile notification sheet */}
      {notifOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" onClick={() => setNotifOpen(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div
            className="anim-fade-up absolute inset-x-3 top-3 rounded-2xl border border-white/10 bg-ink-800 p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-bold text-white">Notifications</p>
              <div className="flex gap-3">
                {unread > 0 && (
                  <button onClick={markAllRead} className="text-[11px] font-semibold text-cyan-400">
                    Tandai dibaca
                  </button>
                )}
                <button onClick={() => setNotifOpen(false)} className="text-slate-400">
                  <Icon name="trash" size={14} className="rotate-90" />
                </button>
              </div>
            </div>
            <div className="max-h-96 space-y-2 overflow-y-auto">
              {notifs.length === 0 && <p className="py-8 text-center text-xs text-slate-500">Belum ada notifikasi.</p>}
              {notifs.map((n) => (
                <div key={n.id} className={`rounded-xl border border-white/5 px-3 py-2.5 ${n.read ? "" : "bg-cyan-500/[0.05]"}`}>
                  <p className="text-xs font-semibold text-slate-200">{n.title}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">{n.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* content */}
      <main className="px-4 pb-28 pt-5 sm:px-6 lg:ml-60 lg:px-8 lg:pb-10 lg:pt-7">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>

      {/* mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t border-white/10 bg-ink-900/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
        {BOTTOM_NAV.map((i) => {
          const active = i.exact ? pathname === i.href : pathname.startsWith(i.href);
          return (
            <Link
              key={i.href}
              href={i.href}
              className={`flex flex-col items-center gap-0.5 rounded-lg px-3 py-2 text-[9px] font-semibold transition ${
                active ? "text-cyan-300" : "text-slate-500"
              }`}
            >
              <Icon name={i.icon} size={18} />
              {i.label}
            </Link>
          );
        })}
      </nav>

      {/* FAB create bot (mobile) */}
      <Link
        href="/dashboard/bots?new=1"
        className="fixed bottom-20 right-4 z-30 flex h-13 w-13 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 p-3.5 text-white shadow-lg shadow-cyan-500/30 lg:hidden"
        aria-label="Create Bot"
      >
        <Icon name="plus" size={20} />
      </Link>
    </div>
  );
}
