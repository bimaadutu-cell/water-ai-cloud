/**
 * Send a real WhatsApp GenAI/Rich HTML WebView.
 *
 * Important: the HTML primitive is not the same thing as a normal
 * `sendMessage({ html: ... })` payload. We deliberately use the rich HTML
 * builder exposed by the Baileys fork and send a BODY/STYLE/SCRIPT fragment,
 * while keeping the source document in the repository for local testing.
 */
import { createRequire } from "node:module";
import path from "node:path";

export type RichHtmlResult = { ok: boolean; method?: string; error?: string };

function randomId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ensureFullHtml(html: string, title = "WATER AI"): string {
  const s = String(html || "").trim();
  if (/<!doctype html|<html[\s>]/i.test(s)) return s;
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><title>${title}</title></head><body>${s}</body></html>`;
}

/** Keep CSS + body + JS, but remove the outer document shell. */
export function toRichHtmlFragment(html: string): string {
  const full = ensureFullHtml(html);
  const head = full.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] || "";
  const body = full.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] || full;
  const styles = [...head.matchAll(/<style\b[^>]*>[\s\S]*?<\/style>/gi)].map(m => m[0]).join("\n");
  const headScripts = [...head.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/gi)].map(m => m[0]).join("\n");
  const bodyScripts = [...body.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/gi)].map(m => m[0]).join("\n");
  const cleanBody = body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  return `${styles}\n${headScripts}\n${cleanBody}\n${bodyScripts}`;
}

function loadBaileys(): any {
  try {
    const req = createRequire(path.join(process.cwd(), "package.json"));
    return req("@stazyu/baileys");
  } catch {
    return null;
  }
}

export async function sendRichHtmlToChat(
  sock: any,
  jid: string,
  html: string,
  opts?: { title?: string; id?: string; source?: string; trustedSources?: string[] }
): Promise<RichHtmlResult> {
  if (!sock || !jid || !html) return { ok: false, error: "missing sock/jid/html" };

  const title = opts?.title || "WATER AI GAME";
  const id = opts?.id || randomId("game");
  const source = opts?.source || "water_ai_game";
  const full = ensureFullHtml(html, title);
  const fragment = toRichHtmlFragment(full);

  // The Chess CAP page loads this audio URL. Rich WebView network access is
  // sandboxed, so explicitly trust the host used by the page.
  const appTrusted = (() => {
    try { return process.env.APP_URL ? new URL(process.env.APP_URL).hostname : null; } catch { return null; }
  })();
  const trustedSources = Array.from(new Set([
    ...(opts?.trustedSources || []),
    "files.catbox.moe",
    ...(appTrusted ? [appTrusted] : []),
  ]));
  const errors: string[] = [];

  // 1. Preferred API: @stazyu/baileys GenAI HTML primitive.
  if (typeof sock.sendRichHtml === "function") {
    try {
      await sock.sendRichHtml(jid, {
        id,
        title,
        html: fragment,
        source,
        trustedSources,
      });
      return { ok: true, method: "sock.sendRichHtml(fragment)" };
    } catch (e: any) {
      errors.push(`sock.sendRichHtml: ${String(e?.message || e).slice(0, 160)}`);
    }
  }

  // 2. Package-level helper. Keep the exact same fragment and trusted host.
  const mod = loadBaileys();
  if (mod?.sendRichHtml) {
    try {
      await mod.sendRichHtml(sock, jid, {
        id,
        title,
        html: fragment,
        source,
        trustedSources,
      });
      return { ok: true, method: "mod.sendRichHtml(fragment)" };
    } catch (e: any) {
      errors.push(`mod.sendRichHtml: ${String(e?.message || e).slice(0, 160)}`);
    }
  }

  // 3. Some compatible forks expose the same renderer as sendInlineWebUI.
  if (mod?.sendInlineWebUI) {
    try {
      await mod.sendInlineWebUI(sock, jid, fragment, title, {
        trustedSources,
      });
      return { ok: true, method: "sendInlineWebUI(fragment)" };
    } catch (e: any) {
      errors.push(`sendInlineWebUI: ${String(e?.message || e).slice(0, 160)}`);
    }
  }

  // 4. Last rich-builder fallback, if the installed fork exports it.
  if (typeof mod?.generateRichHtmlContent === "function") {
    try {
      const content = mod.generateRichHtmlContent({
        id,
        title,
        html: fragment,
        source,
        trustedSources,
      });
      if (content) {
        const sent = await sock.sendMessage(jid, content);
        if (sent?.key?.id) return { ok: true, method: "generateRichHtmlContent" };
      }
    } catch (e: any) {
      errors.push(`generateRichHtmlContent: ${String(e?.message || e).slice(0, 160)}`);
    }
  }

  return { ok: false, error: errors.join(" | ") || "Installed Baileys build exposes no Rich HTML sender" };
}
