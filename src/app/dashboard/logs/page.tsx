"use client";

import { useState } from "react";
import {
  api,
  useApi,
  Icon,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Spinner,
  timeAgo,
} from "@/components/ui";

type LogRow = {
  id: string;
  level: string;
  event: string;
  status: string | null;
  message: string;
  requestId: string | null;
  botId: string | null;
  createdAt: string;
};
type LogsData = { logs: LogRow[]; page: number; totalPages: number };

const FILTERS = [
  { id: "all", label: "All" },
  { id: "success", label: "Success" },
  { id: "warning", label: "Warning" },
  { id: "error", label: "Error" },
  { id: "api", label: "API" },
];

export default function LogsPage() {
  const [level, setLevel] = useState("all");
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");
  const [page, setPage] = useState(1);

  const qs = new URLSearchParams();
  if (level !== "all") qs.set("level", level);
  if (applied) qs.set("search", applied);
  qs.set("page", String(page));
  const { data, loading, error, reload } = useApi<LogsData>(`/dashboard/logs?${qs.toString()}`, [level, applied, page]);

  const doSearch = () => {
    setApplied(search);
    setPage(1);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-white">Logs</h2>
          <p className="text-xs text-slate-500">Log real dari backend — auth, bot lifecycle, command, API, webhook.</p>
        </div>
        <div className="flex gap-2">
          <input
            className="input w-44 !py-2"
            placeholder="Cari event/pesan..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doSearch()}
          />
          <Button variant="ghost" className="!py-2" onClick={doSearch}>
            <Icon name="search" size={14} />
          </Button>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => {
              setLevel(f.id);
              setPage(1);
            }}
            className={`shrink-0 rounded-full border px-4 py-1.5 text-[11px] font-semibold transition ${
              level === f.id ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-300" : "border-white/10 text-slate-400 hover:border-white/20"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && !data ? (
        <div className="flex flex-col items-center gap-3 py-16 text-slate-500">
          <Spinner size={22} />
          <p className="text-xs">Memuat log...</p>
        </div>
      ) : error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data || data.logs.length === 0 ? (
        <EmptyState icon={<Icon name="scroll" size={30} />} title="No logs found" desc="Coba ubah filter atau kata kunci pencarian." />
      ) : (
        <>
          <div className="card overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/5 text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Level</th>
                  <th className="px-4 py-3">Event</th>
                  <th className="hidden px-4 py-3 md:table-cell">Status</th>
                  <th className="px-4 py-3">Message</th>
                  <th className="hidden px-4 py-3 lg:table-cell">Request ID</th>
                </tr>
              </thead>
              <tbody>
                {data.logs.map((l) => (
                  <tr key={l.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-500">{timeAgo(l.createdAt)}</td>
                    <td className="px-4 py-2.5">
                      <Badge tone={l.level === "error" ? "red" : l.level === "warning" ? "amber" : l.level === "success" ? "green" : l.level === "api" ? "blue" : "slate"}>
                        {l.level}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-slate-400">{l.event}</td>
                    <td className="hidden px-4 py-2.5 text-slate-500 md:table-cell">{l.status ?? "—"}</td>
                    <td className="max-w-72 px-4 py-2.5">
                      <p className="truncate text-slate-300" title={l.message}>{l.message}</p>
                    </td>
                    <td className="hidden px-4 py-2.5 font-mono text-[10px] text-slate-600 lg:table-cell">{l.requestId ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              Halaman {data.page} dari {data.totalPages}
            </span>
            <div className="flex gap-2">
              <Button variant="ghost" className="!py-1.5 !text-[11px]" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                ← Sebelumnya
              </Button>
              <Button variant="ghost" className="!py-1.5 !text-[11px]" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>
                Berikutnya →
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
