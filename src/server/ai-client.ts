/** Server-only AI client. Gemini is the preferred provider; OpenAI-compatible AI remains backward compatible. */
export interface AiRequest {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  imageBase64?: string;
  imageMime?: string;
}

function envNumber(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function aiProvider(): "gemini" | "openai-compatible" | "none" {
  if (process.env.GEMINI_API_KEY?.trim()) return "gemini";
  if (process.env.AI_API_KEY?.trim()) return "openai-compatible";
  return "none";
}

export async function callAi(req: AiRequest): Promise<string> {
  const provider = aiProvider();
  if (provider === "none") throw new Error("AI_NOT_CONFIGURED");
  const timeout = envNumber("GEMINI_TIMEOUT_MS", 60000);
  const temperature = req.temperature ?? envNumber("GEMINI_TEMPERATURE", 0.7);
  const maxTokens = req.maxTokens ?? envNumber("GEMINI_MAX_OUTPUT_TOKENS", 8192);

  const messages: any[] = [{ role: "system", content: req.system }];
  if (req.imageBase64) {
    messages.push({
      role: "user",
      content: [
        { type: "text", text: req.user },
        { type: "image_url", image_url: { url: `data:${req.imageMime ?? "image/png"};base64,${req.imageBase64}` } },
      ],
    });
  } else messages.push({ role: "user", content: req.user });

  const base = provider === "gemini"
    ? (process.env.GEMINI_BASE_URL?.trim() || "https://generativelanguage.googleapis.com/v1beta/openai")
    : (process.env.AI_BASE_URL?.trim() || "https://api.openai.com/v1");
  const model = provider === "gemini"
    ? (process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash-lite")
    : (process.env.AI_MODEL?.trim() || "gpt-4o-mini");
  const key = provider === "gemini" ? process.env.GEMINI_API_KEY!.trim() : process.env.AI_API_KEY!.trim();

  const res = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, temperature, max_tokens: maxTokens, messages }),
    signal: AbortSignal.timeout(timeout),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const detail = body.match(/"message"\s*:\s*"([^"]+)/i)?.[1] || "";
    const err = new Error(`AI_HTTP_${res.status}${detail ? `:${detail.slice(0, 180)}` : ""}`);
    (err as any).status = res.status;
    throw err;
  }
  const json: any = await res.json();
  const text = json?.choices?.[0]?.message?.content;
  if (Array.isArray(text)) return text.map((x: any) => x?.text || "").join("\n").trim() || "AI tidak memberikan jawaban.";
  return String(text || "AI tidak memberikan jawaban.");
}

export function aiUserMessage(error: any): string {
  const status = Number(error?.status);
  if (error?.message === "AI_NOT_CONFIGURED") return "⚠️ AI belum dikonfigurasi di server. Pasang GEMINI_API_KEY lalu restart service.";
  if (status === 401 || status === 403) return "⚠️ Kredensial AI ditolak server provider. Periksa GEMINI_API_KEY.";
  if (status === 404) return "⚠️ Model AI tidak tersedia. Periksa GEMINI_MODEL.";
  if (status === 408 || status === 504 || /timeout/i.test(String(error?.message))) return "⏱️ AI timeout. Coba lagi sebentar.";
  if (status === 413) return "📦 Input AI terlalu besar. Kurangi ukuran pesan/media.";
  if (status === 429) return "⏳ AI sedang membatasi request. Coba lagi beberapa saat.";
  if (status >= 500) return "⚠️ Layanan AI sedang bermasalah. Coba lagi nanti.";
  return "⚠️ AI tidak dapat dihubungi saat ini.";
}
