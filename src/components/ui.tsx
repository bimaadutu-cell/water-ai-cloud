"use client";

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

/* ------------------------------ fetch helpers ------------------------------ */
export class ApiErrorC extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export async function api<T = any>(
  path: string,
  method = "GET",
  body?: unknown
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* no body */
  }
  if (!res.ok || json?.success === false) {
    throw new ApiErrorC(
      json?.error?.code ?? `HTTP_${res.status}`,
      json?.error?.message ?? `Request gagal (${res.status})`
    );
  }
  return json?.data as T;
}

export function useApi<T = any>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!!path);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    setError(null);
    try {
      const d = await api<T>(path);
      setData(d);
    } catch (e: any) {
      setError(e.message ?? "Terjadi kesalahan");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);
  useEffect(() => {
    load();
  }, [load]);
  return { data, loading, error, reload: load };
}

/* ------------------------------- primitives ------------------------------- */
export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <span
      className="anim-spin inline-block rounded-full border-2 border-aqua-400/30 border-t-aqua-400"
      style={{ width: size, height: size }}
    />
  );
}

export function Button({
  children,
  variant = "primary",
  loading,
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger";
  loading?: boolean;
}) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={`btn btn-${variant} ${className}`}
    >
      {loading && <Spinner size={14} />}
      {children}
    </button>
  );
}

export function Badge({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: "slate" | "cyan" | "green" | "amber" | "red" | "blue";
}) {
  const map: Record<string, string> = {

    slate: "bg-slate-500/10 text-slate-300 border-slate-500/25",
    cyan: "bg-cyan-500/10 text-cyan-300 border-cyan-500/30",
    green: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
    amber: "bg-amber-500/10 text-amber-300 border-amber-500/30",
    red: "bg-red-500/10 text-red-300 border-red-500/30",
    blue: "bg-blue-500/10 text-blue-300 border-blue-500/30",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide ${map[tone]}`}
    >
      {children}
    </span>
  );
}

const STATUS_TONE: Record<string, { tone: "green" | "slate" | "amber" | "cyan" | "red" | "blue"; label: string }> = {
  online: { tone: "green", label: "ONLINE" },
  connected: { tone: "green", label: "CONNECTED" },
  connecting: { tone: "cyan", label: "CONNECTING" },
  waiting: { tone: "cyan", label: "WAITING" },
  reconnecting: { tone: "amber", label: "RECONNECTING" },
  offline: { tone: "slate", label: "OFFLINE" },
  disconnected: { tone: "slate", label: "DISCONNECTED" },
  error: { tone: "red", label: "ERROR" },
  active: { tone: "green", label: "ACTIVE" },
  pending: { tone: "amber", label: "PENDING" },
  success: { tone: "green", label: "SUCCESS" },
  failed: { tone: "red", label: "FAILED" },
  open: { tone: "cyan", label: "OPEN" },
  waiting2: { tone: "amber", label: "WAITING" },
  answered: { tone: "blue", label: "ANSWERED" },
  closed: { tone: "slate", label: "CLOSED" },
};

export function StatusPill({ status }: { status: string }) {
  const s = STATUS_TONE[status] ?? { tone: "slate" as const, label: status.toUpperCase() };
  const live = ["online", "connected", "connecting", "waiting", "reconnecting"].includes(status);
  return (
    <Badge tone={s.tone}>
      <span className={`h-1.5 w-1.5 rounded-full bg-current ${live ? "pulse-dot" : ""}`} />
      {s.label}
    </Badge>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className={`anim-fade-up max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-slate-700/40 bg-ink-800 p-5 shadow-2xl sm:rounded-2xl ${wide ? "sm:max-w-2xl" : "sm:max-w-md"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-base font-bold text-white">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white"
            aria-label="Tutup"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  desc,
  action,
}: {
  icon?: ReactNode;
  title: string;
  desc?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-700/50 px-6 py-14 text-center">
      <div className="mb-3 text-slate-600">{icon ?? <Icon name="inbox" size={30} />}</div>
      <h4 className="font-display text-sm font-semibold text-slate-300">{title}</h4>
      {desc && <p className="mt-1 max-w-sm text-xs text-slate-500">{desc}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/5 px-6 py-12 text-center">
      <Icon name="alert" size={28} className="mb-3 text-red-400" />
      <p className="text-sm font-medium text-red-200">Something went wrong</p>
      <p className="mt-1 text-xs text-red-300/70">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="btn btn-ghost mt-4 !py-1.5 !text-xs">
          Coba lagi
        </button>
      )}
    </div>
  );
}

/* ------------------------------- SVG charts ------------------------------- */
export function MiniBars({
  data,
  height = 96,
  color = "#22d3ee",
}: {
  data: { d: string; n: number }[];
  height?: number;
  color?: string;
}) {
  const max = Math.max(1, ...data.map((x) => x.n));
  return (
    <div className="w-full">
      <div className="flex items-end gap-1" style={{ height }}>
        {data.map((x, i) => (
          <div key={x.d + i} className="group relative flex-1">
            <div
              className="w-full rounded-t-sm transition-all duration-500"
              style={{
                height: Math.max(3, (x.n / max) * height),
                background: `linear-gradient(180deg, ${color}, ${color}44)`,
                opacity: 0.55 + 0.45 * (x.n / max),
              }}
            />
            <div className="pointer-events-none absolute -top-6 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded bg-slate-900 px-1.5 py-0.5 text-[10px] text-cyan-200 opacity-0 transition group-hover:opacity-100">
              {x.n}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1">
        {data.map((x, i) => (
          <div key={x.d + i} className="flex-1 text-center text-[9px] text-slate-600">
            {data.length <= 8 ? x.d.slice(5) : i % Math.ceil(data.length / 8) === 0 ? x.d.slice(5) : ""}
          </div>
        ))}
      </div>
    </div>
  );
}

export function MiniLine({
  data,
  height = 96,
  color = "#38bdf8",
}: {
  data: { d: string; n: number }[];
  height?: number;
  color?: string;
}) {
  const w = 300;
  const max = Math.max(1, ...data.map((x) => x.n));
  const pts = data.map((x, i) => {
    const px = data.length === 1 ? w / 2 : (i / (data.length - 1)) * w;
    const py = height - (x.n / max) * (height - 8) - 2;
    return `${px},${py}`;
  });
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full" style={{ height }}>
      <defs>
        <linearGradient id="ln-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {pts.length > 1 && (
        <>
          <polygon points={`0,${height} ${pts.join(" ")} ${w},${height}`} fill="url(#ln-fill)" />
          <polyline
            points={pts.join(" ")}
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </>
      )}
      {data.map((x, i) => {
        const px = data.length === 1 ? w / 2 : (i / (data.length - 1)) * w;
        const py = height - (x.n / max) * (height - 8) - 2;
        return <circle key={i} cx={px} cy={py} r="2.5" fill={color} />;
      })}
    </svg>
  );
}

/* --------------------------------- icons --------------------------------- */
const PATHS: Record<string, string> = {
  cloud: "M17.5 19a4.5 4.5 0 1 0-.9-8.9 6 6 0 0 0-11.3 2A3.5 3.5 0 0 0 6.5 19h11z",
  bot: "M8 6V4h8v2M5 10h14v10H5zM9 14h.01M15 14h.01M9 17h6",
  bolt: "M13 2 4 14h6l-1 8 9-12h-6l1-8z",
  qr: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h3v3h-3zM17 17h3v3h-3z",
  layers: "M12 2 2 7l10 5 10-5-10-5zM2 12l10 5 10-5M2 17l10 5 10-5",
  code: "m8 8-4 4 4 4M16 8l4 4-4 4M13 5l-2 14",
  hook: "M9 7V4a3 3 0 0 1 6 0v3m-9 0h12v6a6 6 0 0 1-12 0V7z",
  cpu: "M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3M6 6h12v12H6zM10 10h4v4h-4z",
  gauge: "M12 15l4-6M5 19a9 9 0 1 1 14 0M12 15h.01",
  key: "M21 8l-8 8-2-2-3 3v2h2l3-3 2 2 9-9a5 5 0 1 0-7-7l-3 3",
  chart: "M3 21h18M7 17V9m5 8V5m5 12v-6",
  scroll: "M8 21h12a2 2 0 0 0 2-2v-2H10v2a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v3h4",
  card: "M3 5h18v14H3zM3 10h18M7 15h4",
  headset: "M4 13a8 8 0 0 1 16 0M4 13v4a2 2 0 0 0 2 2h1v-6H4zm16 0v4a2 2 0 0 1-2 2h-1v-6h3z",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2-1.2L14.5 3h-5l-.4 2.6a7.6 7.6 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 2 1.2l.4 2.6h5l.4-2.6a7.6 7.6 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm10 2-5-5",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  edit: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z",
  play: "M6 4l14 8-14 8V4z",
  stop: "M6 6h12v12H6z",
  refresh: "M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6",
  wifi: "M5 12.5a11 11 0 0 1 14 0M8.5 16a6 6 0 0 1 7 0M12 19.5h.01M2 9a16 16 0 0 1 20 0",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M10.3 21a2 2 0 0 0 3.4 0",
  user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  home: "M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5",
  msg: "M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10z",
  doc: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM14 2v6h6M9 13h6M9 17h6",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  alert: "M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  check: "M20 6 9 17l-5-5",
  inbox: "M22 12h-6l-2 3h-4l-2-3H2M5.5 5h13l3.5 7v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-7l3.5-7z",
  plus: "M12 5v14M5 12h14",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 3",
  send: "m22 2-7 20-4-9-9-4 20-7z",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
};

export function Icon({
  name,
  size = 18,
  className = "",
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d={PATHS[name] ?? PATHS.inbox} />
    </svg>
  );
}

/* --------------------------------- utils --------------------------------- */
export function timeAgo(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 5) return "baru saja";
  if (s < 60) return `${s} dtk lalu`;
  if (s < 3600) return `${Math.floor(s / 60)} mnt lalu`;
  if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`;
  return `${Math.floor(s / 86400)} hari lalu`;
}

export function fmtDate(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtUptime(sec: number | null | undefined): string {
  if (!sec) return "—";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d) return `${d}h ${h}j ${m}m`;
  if (h) return `${h}j ${m}m`;
  return `${m}m ${Math.floor(sec % 60)}d`;
}

export function fmtNum(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(n);
}

export function CopyBtn({ text, label = "Salin" }: { text: string; label?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      className="btn btn-ghost !px-2.5 !py-1 !text-[11px]"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setOk(true);
          setTimeout(() => setOk(false), 1500);
        } catch {
          /* noop */
        }
      }}
    >
      {ok ? <Icon name="check" size={12} /> : <Icon name="doc" size={12} />}
      {ok ? "Tersalin" : label}
    </button>
  );
}

/* ------------------------------- toast bus -------------------------------- */
type Toast = { id: number; title: string; desc?: string; tone: "ok" | "err" };
let pushToast: (t: Omit<Toast, "id">) => void = () => {};
export function toast(title: string, desc?: string, tone: "ok" | "err" = "ok") {
  pushToast({ title, desc, tone });
}

export function ToastHost() {
  const [items, setItems] = useState<Toast[]>([]);
  const idRef = useRef(0);
  useEffect(() => {
    pushToast = (t) => {
      const id = ++idRef.current;
      setItems((p) => [...p, { ...t, id }]);
      setTimeout(() => setItems((p) => p.filter((x) => x.id !== id)), 4200);
    };
    return () => {
      pushToast = () => {};
    };
  }, []);
  return (
    <div className="pointer-events-none fixed bottom-20 left-1/2 z-[60] flex w-[92%] max-w-sm -translate-x-1/2 flex-col gap-2 sm:bottom-6">
      {items.map((t) => (
        <div
          key={t.id}
          className={`anim-fade-up pointer-events-auto flex items-start gap-2.5 rounded-xl border px-4 py-3 shadow-xl backdrop-blur-md ${
            t.tone === "ok"
              ? "border-cyan-500/30 bg-ink-800/95"
              : "border-red-500/30 bg-ink-800/95"
          }`}
        >
          <Icon
            name={t.tone === "ok" ? "check" : "alert"}
            size={16}
            className={t.tone === "ok" ? "mt-0.5 text-cyan-400" : "mt-0.5 text-red-400"}
          />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-white">{t.title}</p>
            {t.desc && <p className="mt-0.5 text-[11px] text-slate-400">{t.desc}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}
