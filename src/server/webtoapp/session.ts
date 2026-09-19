import { randomUUID } from "node:crypto";

export type WebToAppState =
  | "WAITING_URL"
  | "WAITING_APP_NAME"
  | "WAITING_ICON"
  | "WAITING_CONFIRMATION"
  | "QUEUED"
  | "BUILDING"
  | "VALIDATING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export interface WebToAppJob {
  jobId: string;
  userJid: string;
  chatJid: string;
  state: WebToAppState;
  url?: string;
  appName?: string;
  iconBuffer?: Buffer;
  iconMime?: string;
  createdAt: number;
  updatedAt: number;
  error?: string;
  provider?: string;
}

const jobs = new Map<string, WebToAppJob>(); // key: userJid

export function getJob(userJid: string): WebToAppJob | undefined {
  return jobs.get(userJid);
}

export function startJob(userJid: string, chatJid: string): WebToAppJob {
  const job: WebToAppJob = {
    jobId: randomUUID(),
    userJid,
    chatJid,
    state: "WAITING_URL",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  jobs.set(userJid, job);
  return job;
}

export function updateJob(userJid: string, patch: Partial<WebToAppJob>): WebToAppJob | undefined {
  const j = jobs.get(userJid);
  if (!j) return undefined;
  Object.assign(j, patch, { updatedAt: Date.now() });
  return j;
}

export function cancelJob(userJid: string): void {
  const j = jobs.get(userJid);
  if (j) {
    j.state = "CANCELLED";
    j.updatedAt = Date.now();
  }
  jobs.delete(userJid);
}

export function isPrivateIp(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h === "metadata.google.internal") return true;
  if (h.endsWith(".local") || h.endsWith(".internal")) return true;
  // crude IPv4 private check
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const a = +m[1], b = +m[2];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  return false;
}

export function validateHttpsUrl(raw: string): { ok: true; url: string } | { ok: false; error: string } {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:") return { ok: false, error: "URL harus HTTPS" };
    if (isPrivateIp(u.hostname)) return { ok: false, error: "Host privat/localhost diblok (SSRF)" };
    return { ok: true, url: u.toString() };
  } catch {
    return { ok: false, error: "URL tidak valid" };
  }
}
