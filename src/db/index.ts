import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(pw, salt, 64)) as Buffer;
  return `s:${salt}:${buf.toString("hex")}`;
}

const rawDatabaseUrl = process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/placeholder";

// Pastikan Railway/Production URL mendukung SSL jika diperlukan
const useSsl = rawDatabaseUrl.includes("railway") || rawDatabaseUrl.includes("render") || rawDatabaseUrl.includes("neon") || rawDatabaseUrl.includes("supavisor") || rawDatabaseUrl.includes("sslmode=require");

const databaseUrl = rawDatabaseUrl;

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
  __initializedDb?: boolean;
  __databaseReady?: Promise<void>;
};

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: databaseUrl,
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);

async function ensureInitialized() {
  if (globalForDb.__initializedDb) return;

  // Fail loudly when DATABASE_URL is missing instead of silently connecting
  // to the local placeholder database. This makes Railway configuration
  // errors immediately visible in the server logs.
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL belum diset. Tambahkan DATABASE_URL pada Railway Variables.");
  }

  try {
    await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username VARCHAR(32) NOT NULL UNIQUE,
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role VARCHAR(12) NOT NULL DEFAULT 'USER',
        plan VARCHAR(20) NOT NULL DEFAULT 'FREE',
        suspended BOOLEAN NOT NULL DEFAULT FALSE,
        email_verified BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_login_at TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        user_agent TEXT,
        ip VARCHAR(64),
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS password_resets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS email_verifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS bots (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(64) NOT NULL,
        runtime VARCHAR(20) NOT NULL DEFAULT 'node',
        prefix VARCHAR(4) NOT NULL DEFAULT '!',
        owner_number VARCHAR(32),
        description TEXT,
        status VARCHAR(16) NOT NULL DEFAULT 'offline',
        session_id UUID UNIQUE,
        whatsapp_number VARCHAR(32),
        uptime_sec INTEGER NOT NULL DEFAULT 0,
        messages_sent INTEGER NOT NULL DEFAULT 0,
        messages_received INTEGER NOT NULL DEFAULT 0,
        settings JSONB NOT NULL DEFAULT '{}'::jsonb,
        last_activity_at TIMESTAMPTZ,
        started_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS whatsapp_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        bot_id UUID NOT NULL UNIQUE REFERENCES bots(id) ON DELETE CASCADE,
        status VARCHAR(16) NOT NULL DEFAULT 'disconnected',
        phone_number VARCHAR(32),
        jid VARCHAR(64),
        platform VARCHAR(50),
        last_pairing_code VARCHAR(12),
        last_pairing_at TIMESTAMPTZ,
        qr_data_url TEXT,
        last_qr_at TIMESTAMPTZ,
        last_connected_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        bot_id UUID REFERENCES bots(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        direction VARCHAR(4) NOT NULL DEFAULT 'in',
        type VARCHAR(24) NOT NULL DEFAULT 'text',
        chat_jid VARCHAR(64),
        chat_name VARCHAR(120),
        text TEXT,
        meta JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS system_settings (
        key VARCHAR(64) PRIMARY KEY,
        value JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        bot_id UUID REFERENCES bots(id) ON DELETE SET NULL,
        level VARCHAR(16) NOT NULL DEFAULT 'info',
        event VARCHAR(64) NOT NULL,
        status VARCHAR(20),
        message TEXT NOT NULL,
        request_id VARCHAR(48),
        meta JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        plan VARCHAR(20) NOT NULL DEFAULT 'FREE',
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Repair older installations created by the previous bootstrap.
    await pool.query(`
      ALTER TABLE system_settings
        DROP CONSTRAINT IF EXISTS system_settings_key_key;
      CREATE UNIQUE INDEX IF NOT EXISTS system_settings_key_unique
        ON system_settings(key);

      ALTER TABLE logs ADD COLUMN IF NOT EXISTS status VARCHAR(20);
      ALTER TABLE logs ADD COLUMN IF NOT EXISTS request_id VARCHAR(48);

      ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    `);

    const adminCheck = await pool.query(
      "SELECT id FROM users WHERE username = 'admin' LIMIT 1"
    );

    if (adminCheck.rows.length === 0) {
      const initialPw = process.env.ADMIN_INITIAL_PASSWORD || "Water@2026";
      const hashed = await hashPassword(initialPw);
      const userRes = await pool.query(
        `INSERT INTO users (username, email, password_hash, role, plan, email_verified)
         VALUES ('admin', 'admin@wateraicloud.dev', $1, 'ADMIN', 'ENTERPRISE', TRUE)
         RETURNING id`,
        [hashed]
      );

      if (userRes.rows.length > 0) {
        await pool.query(
          `INSERT INTO subscriptions (user_id, plan, status)
           VALUES ($1, 'ENTERPRISE', 'active')`,
          [userRes.rows[0].id]
        );
      }
    }

    globalForDb.__initializedDb = true;
  } catch (e) {
    console.error("CRITICAL DATABASE INITIALIZATION ERROR:", e);
    throw e;
  }
}

/**
 * Every database-dependent request should await this before using Drizzle.
 * The previous version started initialization in the background, so the
 * first login request could query `users` before the table existed and
 * return the generic "Terjadi kesalahan pada server".
 */
export function ensureDatabaseReady(): Promise<void> {
  if (globalForDb.__initializedDb) return Promise.resolve();
  if (!globalForDb.__databaseReady) {
    globalForDb.__databaseReady = ensureInitialized().catch((error) => {
      // Allow a later request/redeploy to retry after a transient DB failure.
      globalForDb.__databaseReady = undefined;
      throw error;
    });
  }
  return globalForDb.__databaseReady;
}

// Start initialization early, but request handlers still await the same
// promise through ensureDatabaseReady(), eliminating the startup race.
ensureDatabaseReady().catch(() => {});

