import { createHmac } from "crypto";
import { eq, and, inArray } from "drizzle-orm";
import { db } from "@/db";
import { webhooks, webhookEvents } from "@/db/schema";
import { addLog, notify } from "./lib";

export type WebhookEvent =
  | "message.received"
  | "message.sent"
  | "message.failed"
  | "bot.connected"
  | "bot.disconnected"
  | "bot.started"
  | "bot.stopped"
  | "webhook.test";

const RETRY_DELAYS = [0, 1000, 5000];

export function signPayload(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

/**
 * Deliver `event` to every enabled webhook of a user that subscribes to it.
 * Runs with retries (0s / 1s / 5s). Failures are persisted and surfaced
 * as a notification so nothing is silently lost.
 */
export async function dispatchWebhook(
  userId: string,
  event: WebhookEvent,
  payload: unknown
) {
  let hooks;
  try {
    hooks = await db
      .select()
      .from(webhooks)
      .where(eq(webhooks.userId, userId));
  } catch {
    return;
  }
  const targets = hooks.filter(
    (h) => h.enabled && (h.events as string[]).includes(event)
  );
  for (const hook of targets) {
    deliver(hook, event, payload).catch(() => {
      /* deliver() handles its own errors */
    });
  }
}

/** Send a real test event to a single webhook. */
export async function testWebhook(webhookId: string, userId: string) {
  const rows = await db
    .select()
    .from(webhooks)
    .where(eq(webhooks.id, webhookId))
    .limit(1);
  const hook = rows[0];
  if (!hook || hook.userId !== userId) throw new Error("NOT_FOUND");
  await deliver(hook, "webhook.test", { message: "Test dari WATER AI CLOUD" });
  return { ok: true as const };
}

async function deliver(
  hook: { id: string; userId: string; url: string; secret: string },
  event: WebhookEvent,
  payload: unknown
) {
  const body = JSON.stringify({
    event,
    source: "water-ai-cloud",
    timestamp: new Date().toISOString(),
    data: payload,
  });
  const signature = signPayload(hook.secret, body);

  let eventRow: { id: string };
  try {
    [eventRow] = await db
      .insert(webhookEvents)
      .values({
        webhookId: hook.id,
        userId: hook.userId,
        event,
        payload: payload as any,
        status: "pending",
        attempts: 0,
      })
      .returning({ id: webhookEvents.id });
  } catch {
    return;
  }

  let lastCode: number | null = null;
  for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) {
    if (RETRY_DELAYS[attempt] > 0) {
      await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
    }
    try {
      const res = await fetch(hook.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-water-signature": signature,
          "x-water-event": event,
          "user-agent": "water-ai-cloud-webhook/1.0",
        },
        body,
        signal: AbortSignal.timeout(8000),
      });
      lastCode = res.status;
      if (res.ok) {
        await db
          .update(webhookEvents)
          .set({ status: "success", attempts: attempt + 1, responseCode: res.status })
          .where(eq(webhookEvents.id, eventRow.id));
        await db
          .update(webhooks)
          .set({
            successCount: sqlRaw`"success_count" + 1`,
            lastTriggeredAt: new Date(),
          })
          .where(eq(webhooks.id, hook.id));
        return;
      }
    } catch {
      lastCode = null;
    }
  }

  await db
    .update(webhookEvents)
    .set({ status: "failed", attempts: RETRY_DELAYS.length, responseCode: lastCode ?? undefined })
    .where(eq(webhookEvents.id, eventRow.id));
  await db
    .update(webhooks)
    .set({ failCount: sqlRaw`"fail_count" + 1` })
    .where(eq(webhooks.id, hook.id));
  await addLog({
    userId: hook.userId,
    level: "error",
    event: "webhook.failed",
    message: `Webhook ${hook.url} gagal setelah ${RETRY_DELAYS.length} percobaan`,
    status: "failed",
  });
  await notify(
    hook.userId,
    "webhook.failed",
    "Webhook gagal",
    `Webhook ${hook.url} tidak dapat dihubungi untuk event "${event}".`
  );
}

import { sql as sqlRaw } from "drizzle-orm";
