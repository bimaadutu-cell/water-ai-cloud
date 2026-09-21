/**
 * Kirim HTML interaktif ke bubble via API Baileys yang support GenAI / Rich HTML.
 */

import { createRequire } from "node:module";
import path from "node:path";

export type RichHtmlResult = {
  ok: boolean;
  method?: string;
  error?: string;
};

function randomId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ensureFullHtml(html: string, title = "WATER AI"): string {
  const s = String(html || "").trim();
  if (/<!DOCTYPE html|<html[\s>]/i.test(s)) return s;
  return `<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${title}</title></head><body>${s}</body></html>`;
}


/**
 * WhatsApp's sendRichHtml expects HTML content for the live web view,
 * not a complete <!doctype html><html><head>...</head> document.
 * Passing a full document can render as an empty/black bubble on clients
 * that sanitize the HTML envelope. Convert the supplied document into a
 * self-contained fragment while preserving <style> and <script>.
 */
export function toRichHtmlFragment(html: string): string {
  const full = ensureFullHtml(html);
  const headMatch = full.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i);
  const bodyMatch = full.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);

  const head = headMatch?.[1] || "";
  const body = bodyMatch?.[1] || full;

  const styles = [...head.matchAll(/<style\b[^>]*>[\s\S]*?<\/style>/gi)]
    .map((m) => m[0])
    .join("\n");
  const scriptsInHead = [...head.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/gi)]
    .map((m) => m[0])
    .join("\n");
  const scriptsInBody = [...body.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/gi)]
    .map((m) => m[0])
    .join("\n");
  const cleanBody = body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");

  return `${styles}${scriptsInHead}${cleanBody}${scriptsInBody}`;
}

function loadBaileysMod(): any {
  try {
    const req = createRequire(
      typeof __filename !== "undefined"
        ? __filename
        : path.join(process.cwd(), "package.json")
    );
    return req("@stazyu/baileys");
  } catch {
    return null;
  }
}

export async function sendRichHtmlToChat(
  sock: any,
  jid: string,
  html: string,
  opts?: { title?: string; id?: string; source?: string }
): Promise<RichHtmlResult> {
  if (!sock || !jid || !html) {
    return { ok: false, error: "missing sock/jid/html" };
  }

  const title = opts?.title || "WATER AI GAME";
  const id = opts?.id || randomId("game");
  const source = opts?.source || "water_ai_game";
  const fullHtml = ensureFullHtml(html, title);
  const richFragment = toRichHtmlFragment(fullHtml);
  const errors: string[] = [];

  // 1) sock.sendRichHtml — try the COMPLETE document first.
  // Some @stazyu/baileys builds expect a document, while others expect a
  // sanitized fragment. The old implementation only tried the fragment,
  // which could produce a blank/black card on clients that require <html>.
  if (typeof sock.sendRichHtml === "function") {
    const variants = [
      { label: "sock.sendRichHtml(full)", html: fullHtml },
      { label: "sock.sendRichHtml(fragment)", html: richFragment },
    ];
    for (const v of variants) {
      try {
        await sock.sendRichHtml(
          jid,
          { id, title, html: v.html, source, trustedSources: [source] },
          null
        );
        return { ok: true, method: v.label };
      } catch (e: any) {
        errors.push(`${v.label}: ${String(e?.message || e).slice(0, 100)}`);
      }
    }
    for (const v of variants) {
      try {
        await sock.sendRichHtml(jid, v.html, undefined, { title, id, source });
        return { ok: true, method: `${v.label}-string` };
      } catch (e: any) {
        errors.push(`${v.label}-string: ${String(e?.message || e).slice(0, 100)}`);
      }
    }
  }

  // 2) Package helpers
  try {
    const mod = loadBaileysMod();
    if (mod?.sendRichHtml) {
      for (const htmlVariant of [fullHtml, richFragment]) {
        await mod.sendRichHtml(sock, jid, {
          id,
          title,
          html: htmlVariant,
          source,
          trustedSources: [source],
        });
        return { ok: true, method: "mod.sendRichHtml" };
      }
    }
    if (mod?.sendInlineWebUI) {
      await mod.sendInlineWebUI(sock, jid, richFragment, title);
      return { ok: true, method: "sendInlineWebUI" };
    }
    if (typeof mod?.generateRichHtmlContent === "function") {
      const content = mod.generateRichHtmlContent({
        id,
        title,
        html: richFragment,
        source,
        trustedSources: [source],
      });
      if (content && typeof content === "object") {
        await sock.sendMessage(jid, content);
        return { ok: true, method: "generateRichHtmlContent" };
      }
    }
  } catch (e: any) {
    errors.push(`pkg: ${String(e?.message || e).slice(0, 80)}`);
  }

  // 3) richResponse / richHtml payloads
  const richAttempts: Array<{ name: string; payload: any }> = [
    {
      name: "richResponse.html",
      payload: {
        richResponse: {
          id,
          title,
          html: richFragment,
          source,
          trustedSources: [source],
        },
      },
    },
    {
      name: "richResponse.html+disclaimer",
      payload: {
        richResponse: {
          id,
          title,
          html: richFragment,
          source,
          trustedSources: [source],
        },
        disclaimerText: title,
        headerText: title,
      },
    },
    {
      name: "richHtml",
      payload: {
        richHtml: {
          id,
          title,
          html: richFragment,
          source,
          trustedSources: [source],
        },
      },
    },
    {
      name: "htmlApp",
      payload: {
        html: richFragment,
        title,
        id,
        source,
        trustedSources: [source],
      },
    },
  ];

  for (const a of richAttempts) {
    try {
      const sent = await sock.sendMessage(jid, a.payload);
      if (sent?.key?.id) {
        return { ok: true, method: a.name };
      }
      errors.push(`${a.name}: no message key`);
    } catch (e: any) {
      errors.push(`${a.name}: ${String(e?.message || e).slice(0, 80)}`);
    }
  }

  return {
    ok: false,
    error: errors.slice(0, 4).join(" | ") || "no rich-html method worked",
  };
}
