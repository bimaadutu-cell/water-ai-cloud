/* WATER AI CLOUD — startup migration & seed.
 * Runs before `next start` (see scripts/start.sh). Makes deployments
 * self-healing: schema drift, legacy columns, missing admin/pricing are
 * all fixed automatically on every boot. Idempotent & safe.
 *
 * Pure Node ESM — only needs `pg` (production dependency).
 */
import { spawnSync } from "node:child_process";
import { randomBytes, scryptSync } from "node:crypto";
import { Client } from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[migrate] DATABASE_URL is required");
  process.exit(1);
}

const PRICING = [
  { id: "free", name: "FREE", price: 0, period: "forever", botLimit: 1, featured: false, cta: "Start Free", features: ["1 Bot", "Basic Automation", "Basic API", "Community Support"] },
  { id: "starter", name: "STARTER", price: 10000, period: "month", botLimit: 3, featured: false, cta: "Upgrade", features: ["3 Bots", "API Access", "Webhooks", "Analytics", "No Ads"] },
  { id: "pro", name: "PRO", price: 25000, period: "month", botLimit: 10, featured: true, cta: "Go Pro", features: ["10 Bots", "Advanced Automation", "AI Integration", "Advanced API", "Priority Support"] },
  { id: "business", name: "BUSINESS", price: 50000, period: "month", botLimit: 25, featured: false, cta: "Scale Up", features: ["25 Bots", "Advanced Analytics", "Multiple API Keys", "Webhook Automation", "Priority Support"] },
  { id: "enterprise", name: "ENTERPRISE", price: 0, period: "custom", botLimit: 999, featured: false, cta: "Contact Us", features: ["Custom Bot Limit", "Dedicated Resources", "Advanced API", "Custom Integration", "Premium Support"] },
];

const hashPw = (pw) => {
  const salt = randomBytes(16).toString("hex");
  return `s:${salt}:${scryptSync(pw, salt, 64).toString("hex")}`;
};

const client = new Client({ connectionString: url, connectionTimeoutMillis: 15000 });
try {
  await client.connect();
} catch (e) {
  console.error("[migrate] Cannot connect to database:", e.message);
  process.exit(1);
}

console.log("[migrate] Connected. Cleaning legacy schema drift...");

// 1) Legacy cleanup — old deployments may have a `password` column or wrong
//    types left over from earlier code versions. drizzle-kit push cannot
//    reconcile those, so we drop/fix them explicitly first.
try {
  await client.query(`ALTER TABLE users DROP COLUMN IF EXISTS password`);
  console.log("[migrate] users.password (legacy) ensured dropped");
} catch (e) {
  // users table may not exist yet on a fresh DB — that is fine
  console.log("[migrate] legacy cleanup skipped:", e.message?.split("\n")[0]);
}

// 2) Schema push — brings DB in sync with src/db/schema.ts
console.log("[migrate] Running drizzle-kit push...");
const push = spawnSync("npx", ["drizzle-kit", "push", "--force"], {
  stdio: "inherit",
  env: process.env,
  timeout: 180000,
});
if (push.status === 0) {
  console.log("[migrate] Schema in sync ✓");
} else {
  console.error(`[migrate] ⚠️ drizzle-kit push failed (exit ${push.status}). Continuing with existing schema — check Railway DB manually if auth errors persist.`);
}

// 3) Idempotent seed — admin account, pricing, settings, announcement
const adminPw = process.env.ADMIN_INITIAL_PASSWORD || "Water@2026";
try {
  const { rows: adminRows } = await client.query(
    `SELECT id FROM users WHERE username = 'admin'`
  );
  if (!adminRows.length) {
    await client.query(
      `INSERT INTO users (username, email, password_hash, role, plan, email_verified)
       VALUES ('admin', 'admin@wateraicloud.dev', $1, 'ADMIN', 'ENTERPRISE', true)`,
      [hashPw(adminPw)]
    );
    await client.query(
      `INSERT INTO subscriptions (user_id, plan, status)
       SELECT id, 'ENTERPRISE', 'active' FROM users WHERE username = 'admin'`
    );
    console.log("──────── Initial admin credentials (terminal only) ────────");
    console.log("  username : admin");
    console.log(`  password : ${adminPw}`);
    console.log("  → Ganti lewat Dashboard → Settings setelah login.");
    console.log("────────────────────────────────────────────────────────────");
  } else {
    console.log("[migrate] Admin account already exists");
  }

  const { rows: pricingRows } = await client.query(
    `SELECT 1 FROM system_settings WHERE key = 'pricing'`
  );
  if (!pricingRows.length) {
    await client.query(
      `INSERT INTO system_settings (key, value) VALUES ('pricing', $1::jsonb)`,
      [JSON.stringify(PRICING)]
    );
    console.log("[migrate] Pricing seeded (FREE/STARTER/PRO/BUSINESS/ENTERPRISE)");
  }

  const { rows: maintRows } = await client.query(
    `SELECT 1 FROM system_settings WHERE key = 'maintenance'`
  );
  if (!maintRows.length) {
    await client.query(
      `INSERT INTO system_settings (key, value) VALUES ('maintenance', $1::jsonb)`,
      [JSON.stringify({ active: false, message: "WATER AI CLOUD sedang dalam perawatan.", eta: "" })]
    );
  }

  const { rows: upRows } = await client.query(
    `SELECT 1 FROM system_settings WHERE key = 'uptimeStartedAt'`
  );
  if (!upRows.length) {
    await client.query(
      `INSERT INTO system_settings (key, value) VALUES ('uptimeStartedAt', $1::jsonb)`,
      [JSON.stringify(new Date().toISOString())]
    );
  }

  const { rows: annCount } = await client.query(
    `SELECT count(*)::int AS n FROM announcements`
  );
  if (annCount[0]?.n === 0) {
    await client.query(
      `INSERT INTO announcements (title, content, type, published)
       VALUES ('WATER AI CLOUD is live', 'Platform resmi aktif. Hubungkan WhatsApp Anda, buat bot, dan mulai otomasi dalam hitungan menit.', 'update', true)`
    );
    console.log("[migrate] Welcome announcement seeded");
  }
} catch (e) {
  console.error("[migrate] Seed step failed:", e.message);
}

await client.end();
console.log("[migrate] Done — starting application.");
