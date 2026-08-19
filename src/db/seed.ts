/* Seed script — run with: npx tsx src/db/seed.ts */
import { scryptSync, randomBytes } from "crypto";
import { db } from "./index";
import {
  users,
  subscriptions,
  systemSettings,
  announcements,
} from "./schema";
import { eq } from "drizzle-orm";

function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pw, salt, 64).toString("hex");
  return `s:${salt}:${hash}`;
}

const PRICING = [
  {
    id: "free",
    name: "FREE",
    price: 0,
    period: "forever",
    botLimit: 1,
    featured: false,
    cta: "Start Free",
    features: ["1 Bot", "Basic Automation", "Basic API", "Community Support"],
  },
  {
    id: "starter",
    name: "STARTER",
    price: 10000,
    period: "month",
    botLimit: 3,
    featured: false,
    cta: "Upgrade",
    features: ["3 Bots", "API Access", "Webhooks", "Analytics", "No Ads"],
  },
  {
    id: "pro",
    name: "PRO",
    price: 25000,
    period: "month",
    botLimit: 10,
    featured: true,
    cta: "Go Pro",
    features: [
      "10 Bots",
      "Advanced Automation",
      "AI Integration",
      "Advanced API",
      "Priority Support",
    ],
  },
  {
    id: "business",
    name: "BUSINESS",
    price: 50000,
    period: "month",
    botLimit: 25,
    featured: false,
    cta: "Scale Up",
    features: [
      "25 Bots",
      "Advanced Analytics",
      "Multiple API Keys",
      "Webhook Automation",
      "Priority Support",
    ],
  },
  {
    id: "enterprise",
    name: "ENTERPRISE",
    price: 0,
    period: "custom",
    botLimit: 999,
    featured: false,
    cta: "Contact Us",
    features: [
      "Custom Bot Limit",
      "Dedicated Resources",
      "Advanced API",
      "Custom Integration",
      "Premium Support",
    ],
  },
];

async function upsertSetting(key: string, value: unknown) {
  const existing = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.key, key))
    .limit(1);
  if (existing.length) {
    await db
      .update(systemSettings)
      .set({ value: value as any, updatedAt: new Date() })
      .where(eq(systemSettings.key, key));
  } else {
    await db.insert(systemSettings).values({ key, value: value as any });
  }
}

async function main() {
  await upsertSetting("pricing", PRICING);
  await upsertSetting("maintenance", {
    active: false,
    message: "WATER AI CLOUD sedang dalam perawatan.",
    eta: "",
  });
  const uptime = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.key, "uptimeStartedAt"))
    .limit(1);
  if (!uptime.length) {
    await db.insert(systemSettings).values({
      key: "uptimeStartedAt",
      value: new Date().toISOString(),
    });
  }

  const existingAdmin = await db
    .select()
    .from(users)
    .where(eq(users.username, "admin"))
    .limit(1);
  if (!existingAdmin.length) {
    const initialPw = process.env.ADMIN_INITIAL_PASSWORD || "Water@2026";
    const [admin] = await db
      .insert(users)
      .values({
        username: "admin",
        email: "admin@wateraicloud.dev",
        passwordHash: hashPassword(initialPw),
        role: "ADMIN",
        plan: "ENTERPRISE",
        emailVerified: true,
      })
      .returning();
    await db.insert(subscriptions).values({
      userId: admin.id,
      plan: "ENTERPRISE",
      status: "active",
    });
    // Credentials only printed to the setup terminal — never rendered in the web UI.
    console.log("──── Initial admin credentials (terminal only) ────");
    console.log(`  username : admin`);
    console.log(`  password : ${initialPw}`);
    console.log(`  email    : admin@wateraicloud.dev`);
    console.log("  → Ganti lewat Dashboard → Settings setelah login.");
    console.log("────────────────────────────────────────────────────");
  } else {
    console.log("Admin user already exists");
  }

  const annCount = await db.select().from(announcements);
  if (!annCount.length) {
    await db.insert(announcements).values({
      title: "WATER AI CLOUD is live",
      content:
        "Platform resmi aktif. Hubungkan WhatsApp Anda, buat bot, dan mulai otomasi dalam hitungan menit. Semua data berjalan di cloud kami dengan isolasi sesi per-bot.",
      type: "update",
      published: true,
    });
    console.log("Seeded welcome announcement");
  }

  console.log("Seed complete.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
