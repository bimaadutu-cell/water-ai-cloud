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
  // The Rich HTML primitive accepts an HTML fragment containing styles/scripts.
  // This is the safest form for WhatsApp's embedded renderer: the renderer
  // supplies its own document shell. We still keep a complete-document
  // fallback below for forks that require it.
  const full = ensureFullHtml(html, title);
  const fragment = toRichHtmlFragment(full);

  const appUrl = process.env.APP_URL || "";
  const appTrusted = (() => {
    try { return appUrl ? new URL(appUrl).hostname : null; } catch { return null; }
  })();
  const trustedSources = Array.from(new Set([
    ...(opts?.trustedSources || []),
    "files.catbox.moe",
    ...(appTrusted ? [appTrusted] : []),
  ]));
  const errors: string[] = [];

  // 1) Preferred: object form documented by @stazyu/baileys.
  if (typeof sock.sendRichHtml === "function") {
    try {
      await sock.sendRichHtml(jid, {
        id,
        title,
        html: fragment,
        source,
        trustedSources,
        ...(appUrl ? { url: appUrl } : {}),
      });
      return { ok: true, method: "sock.sendRichHtml(fragment)" };
    } catch (e: any) {
      errors.push(`sock.sendRichHtml(object): ${String(e?.message || e).slice(0, 240)}`);
    }

    // 2) Raw-string overload. This is also documented by the package and
    // keeps the original HTML untouched.
    try {
      await sock.sendRichHtml(jid, fragment, undefined, {
        title,
        source,
        trustedSources,
        ...(appUrl ? { url: appUrl } : {}),
      });
      return { ok: true, method: "sock.sendRichHtml(raw-fragment)" };
    } catch (e: any) {
      errors.push(`sock.sendRichHtml(raw): ${String(e?.message || e).slice(0, 240)}`);
    }
  }

  const mod = loadBaileys();

  // 3) Package-level helper with the same full document.
  if (mod?.sendRichHtml) {
    try {
      await mod.sendRichHtml(sock, jid, {
        id,
        title,
        html: fragment,
        source,
        trustedSources,
        ...(appUrl ? { url: appUrl } : {}),
      });
      return { ok: true, method: "mod.sendRichHtml(fragment)" };
    } catch (e: any) {
      errors.push(`mod.sendRichHtml: ${String(e?.message || e).slice(0, 240)}`);
    }
  }

  // 4) Compatible inline-WebUI fallback.
  if (mod?.sendInlineWebUI) {
    try {
      await mod.sendInlineWebUI(sock, jid, full, title, { trustedSources, ...(appUrl ? { url: appUrl } : {}) });
      return { ok: true, method: "sendInlineWebUI(full-document)" };
    } catch (e: any) {
      errors.push(`sendInlineWebUI: ${String(e?.message || e).slice(0, 240)}`);
    }
  }

  // 5) Low-level composer fallback.
  if (typeof mod?.generateRichHtmlContent === "function") {
    try {
      const content = mod.generateRichHtmlContent({
        id,
        title,
        html: full,
        source,
        trustedSources,
        ...(appUrl ? { url: appUrl } : {}),
      });
      if (content) {
        const sent = await sock.sendMessage(jid, content);
        if (sent?.key?.id) return { ok: true, method: "generateRichHtmlContent(full-document)" };
      }
    } catch (e: any) {
      errors.push(`generateRichHtmlContent: ${String(e?.message || e).slice(0, 240)}`);
    }
  }

  return { ok: false, error: errors.join(" | ") || "Installed Baileys build exposes no Rich HTML sender" };
}
