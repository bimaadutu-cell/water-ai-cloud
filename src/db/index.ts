import { Pool } from "pg";
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";
import { drizzle } from "drizzle-orm/node-postgres";

const scryptAsync = promisify(scrypt);

async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(pw, salt, 64)) as Buffer;
  return `s:${salt}:${buf.toString("hex")}`;
}

function buildPoolConfig() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    return {
      connectionString: "postgresql://localhost:5432/postgres",
      ssl: false,
      enableChannelBinding: false,
    } as const;
  }

  let databaseUrl = url;
  let useSsl = false;
  let enableChannelBinding = false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const sslMode = parsed.searchParams.get("sslmode")?.toLowerCase();
    const channelBinding = parsed.searchParams.get("channel_binding")?.toLowerCase();
    const isNeon = host.endsWith(".neon.tech") || host.includes(".neon.tech");

    useSsl = isNeon || sslMode === "require" || sslMode === "verify-ca" || sslMode === "verify-full";
    enableChannelBinding = isNeon || channelBinding === "require";

    if (host.endsWith(".railway.internal") || host === "railway.internal") {
      useSsl = false;
      enableChannelBinding = false;
      parsed.searchParams.delete("sslmode");
      parsed.searchParams.delete("channel_binding");
      databaseUrl = parsed.toString();
    }
  } catch {
    throw new Error("DATABASE_URL tidak valid. Gunakan URL PostgreSQL Railway atau Neon yang lengkap.");
  }

  return {
    connectionString: databaseUrl,
    ssl: useSsl ? { rejectUnauthorized: false } : false,
    enableChannelBinding,
    max: 10,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
  } as const;
}

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
  __initializedDb?: boolean;
  __databaseReady?: Promise<void>;
};

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool(buildPoolConfig());

if (!globalForDb.__arenaNextJsPostgresqlPool) {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);

function quoteIdent(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

async function repairLegacyAuthTables() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const usersTableCheck = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'users'
    `);
    if (!usersTableCheck.rows.length) {
      await client.query("COMMIT");
      return;
    }

    // Check if legacy 'password' column exists and 'password_hash' does not
    const cols = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users'
    `);
    const colNames = cols.rows.map((r) => r.column_name);

    if (colNames.includes("password") && !colNames.includes("password_hash")) {
      await client.query(`ALTER TABLE public.users RENAME COLUMN password TO password_hash`);
    } else if (colNames.includes("password") && colNames.includes("password_hash")) {
      await client.query(`UPDATE public.users SET password_hash = COALESCE(password_hash, password) WHERE password_hash IS NULL`);
      await client.query(`ALTER TABLE public.users DROP COLUMN IF EXISTS password`);
    }

    const usersId = await client.query(`
      SELECT c.data_type, c.udt_name
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'users'
        AND c.column_name = 'id'
    `);

    if (!usersId.rows.length) {
      await client.query("COMMIT");
      return;
    }

    const usersIdType = String(usersId.rows[0].udt_name || "").toLowerCase();

    if (["int2", "int4", "int8", "numeric"].includes(usersIdType)) {
      console.warn(`[DB MIGRATION] users.id is ${usersIdType}; migrating existing user IDs to UUID.`);

      await client.query(`CREATE TEMP TABLE _wac_user_id_map (old_id TEXT PRIMARY KEY, new_id UUID NOT NULL) ON COMMIT DROP`);

      await client.query(`
        INSERT INTO _wac_user_id_map (old_id, new_id)
        SELECT id::text, gen_random_uuid()
        FROM public.users;
      `);

      const tablesWithUserId = await client.query(`
        SELECT DISTINCT c.table_name
        FROM information_schema.columns c
        JOIN information_schema.tables t
          ON t.table_name = c.table_name AND t.table_schema = c.table_schema
        WHERE c.table_schema = 'public'
          AND c.column_name = 'user_id'
          AND c.table_name <> 'users'
          AND t.table_type = 'BASE TABLE'
      `);

      for (const row of tablesWithUserId.rows) {
        const tableName = String(row.table_name);
        await client.query(`ALTER TABLE public.${quoteIdent(tableName)} ADD COLUMN __wac_user_id_uuid UUID`);
        await client.query(
          `UPDATE public.${quoteIdent(tableName)} t
           SET __wac_user_id_uuid = m.new_id
           FROM _wac_user_id_map m
           WHERE t.user_id::text = m.old_id`,
        );

        const unmapped = await client.query(
          `SELECT COUNT(*)::int AS count FROM public.${quoteIdent(tableName)} WHERE user_id IS NOT NULL AND __wac_user_id_uuid IS NULL`,
        );
        if (Number(unmapped.rows[0]?.count || 0) > 0) {
          throw new Error(`Database migration gagal: ${tableName}.user_id memiliki ID user yang tidak ditemukan di public.users.`);
        }
      }

      const fks = await client.query(`
        SELECT tc.table_name, tc.constraint_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
        WHERE tc.table_schema = 'public'
          AND tc.constraint_type = 'FOREIGN KEY'
          AND ccu.table_name = 'users'
          AND ccu.column_name = 'id'
      `);

      for (const fk of fks.rows) {
        await client.query(`ALTER TABLE public.${quoteIdent(fk.table_name)} DROP CONSTRAINT IF EXISTS ${quoteIdent(fk.constraint_name)}`);
      }

      await client.query(`ALTER TABLE public.users ADD COLUMN __wac_id_uuid UUID`);
      await client.query(`
        UPDATE public.users u
        SET __wac_id_uuid = m.new_id
        FROM _wac_user_id_map m
        WHERE u.id::text = m.old_id
      `);

      const missingUsers = await client.query(`
        SELECT COUNT(*)::int AS count FROM public.users WHERE __wac_id_uuid IS NULL
      `);
      if (Number(missingUsers.rows[0]?.count || 0) > 0) {
        throw new Error("Database migration gagal: ada user yang tidak mendapatkan UUID baru.");
      }

      const pk = await client.query(`
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.users'::regclass AND contype = 'p'
        LIMIT 1
      `);
      if (pk.rows[0]?.conname) {
        await client.query(`ALTER TABLE public.users DROP CONSTRAINT IF EXISTS ${quoteIdent(String(pk.rows[0].conname))}`);
      }

      await client.query(`ALTER TABLE public.users DROP COLUMN id`);
      await client.query(`ALTER TABLE public.users RENAME COLUMN __wac_id_uuid TO id`);
      await client.query(`ALTER TABLE public.users ADD CONSTRAINT users_pkey PRIMARY KEY (id)`);

      for (const row of tablesWithUserId.rows) {
        const tableName = String(row.table_name);
        const isNullableRes = await client.query(
          `SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'user_id'`,
          [tableName],
        );
        const isNullable = isNullableRes.rows[0]?.is_nullable === "YES";

        await client.query(`ALTER TABLE public.${quoteIdent(tableName)} DROP COLUMN user_id`);
        await client.query(`ALTER TABLE public.${quoteIdent(tableName)} RENAME COLUMN __wac_user_id_uuid TO user_id`);
        if (!isNullable) {
          await client.query(`ALTER TABLE public.${quoteIdent(tableName)} ALTER COLUMN user_id SET NOT NULL`);
        }
      }
    }

    const authTables = ["password_resets", "email_verifications", "sessions"];
    for (const tableName of authTables) {
      const column = await client.query(
        `SELECT udt_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'user_id' LIMIT 1`,
        [tableName],
      );
      if (column.rows.length && String(column.rows[0].udt_name) !== "uuid") {
        await client.query(`DROP TABLE IF EXISTS ${quoteIdent(tableName)} CASCADE`);
      }
    }

    const uuidChildren = await client.query(`
      SELECT c.table_name, c.is_nullable
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.column_name = 'user_id'
        AND c.table_name <> 'users'
    `);

    for (const row of uuidChildren.rows) {
      const tableName = String(row.table_name);
      const constraintName = quoteIdent(`${tableName}_user_id_users_id_fkey`);
      const onDeleteAction = "CASCADE";

      await client.query(
        `ALTER TABLE public.${quoteIdent(tableName)} DROP CONSTRAINT IF EXISTS ${quoteIdent(`${tableName}_user_id_fkey`)},
                                                     DROP CONSTRAINT IF EXISTS ${constraintName}`,
      );

      const hasOrphan = await client.query(`
        SELECT COUNT(*)::int AS count
        FROM public.${quoteIdent(tableName)} t
        LEFT JOIN public.users u ON u.id = t.user_id
        WHERE t.user_id IS NOT NULL AND u.id IS NULL
      `);

      if (Number(hasOrphan.rows[0]?.count || 0) > 0) {
        if (row.is_nullable) {
          await client.query(`UPDATE public.${quoteIdent(tableName)} SET user_id = NULL WHERE user_id NOT IN (SELECT id FROM public.users)`);
        } else {
          const fallbackAdmin = await client.query(`SELECT id FROM public.users ORDER BY created_at ASC LIMIT 1`);
          if (fallbackAdmin.rows.length > 0) {
            await client.query(`UPDATE public.${quoteIdent(tableName)} SET user_id = $1 WHERE user_id NOT IN (SELECT id FROM public.users)`, [
              fallbackAdmin.rows[0].id,
            ]);
          }
        }
      }

      await client.query(`
        ALTER TABLE public.${quoteIdent(tableName)}
        ADD CONSTRAINT ${constraintName}
        FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE ${onDeleteAction}
      `);
    }

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("[DB MIGRATION ERROR]", e);
    throw e;
  } finally {
    client.release();
  }
}

async function ensureInitialized() {
  if (globalForDb.__initializedDb) return;
  try {
    await repairLegacyAuthTables();

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

      CREATE TABLE IF NOT EXISTS commands (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        bot_id UUID NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
        trigger VARCHAR(64) NOT NULL,
        action VARCHAR(64) NOT NULL DEFAULT 'reply',
        response TEXT NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        runs INTEGER NOT NULL DEFAULT 0,
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

      CREATE TABLE IF NOT EXISTS notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(64) NOT NULL,
        title VARCHAR(120) NOT NULL,
        body TEXT NOT NULL,
        read BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(12) NOT NULL DEFAULT 'USER';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS plan VARCHAR(20) NOT NULL DEFAULT 'FREE';
    `);

    // Seed default pricing if not exists
    const pricingCheck = await pool.query("SELECT key FROM system_settings WHERE key = 'pricing' LIMIT 1");
    if (pricingCheck.rows.length === 0) {
      const defaultPricing = [
        { id: "free", name: "FREE", price: 0, period: "forever", botLimit: 5, featured: false, cta: "Start Free", features: ["5 Bots", "Basic Automation", "Basic API"] },
        { id: "starter", name: "STARTER", price: 10000, period: "month", botLimit: 15, featured: false, cta: "Upgrade", features: ["15 Bots", "API Access", "Webhooks"] },
        { id: "pro", name: "PRO", price: 25000, period: "month", botLimit: 50, featured: true, cta: "Go Pro", features: ["50 Bots", "AI Integration", "Priority Support"] },
        { id: "enterprise", name: "ENTERPRISE", price: 50000, period: "month", botLimit: 999, featured: false, cta: "Enterprise", features: ["Unlimited Bots", "Dedicated Support"] },
      ];
      await pool.query(
        `INSERT INTO system_settings (key, value) VALUES ('pricing', $1::jsonb) ON CONFLICT (key) DO UPDATE SET value = $1::jsonb`,
        [JSON.stringify(defaultPricing)]
      );
    }

    const adminCheck = await pool.query("SELECT id FROM users WHERE username = 'admin' LIMIT 1");
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

export function ensureDatabaseReady(): Promise<void> {
  if (globalForDb.__initializedDb) return Promise.resolve();
  if (!globalForDb.__databaseReady) {
    globalForDb.__databaseReady = ensureInitialized().catch((error) => {
      globalForDb.__databaseReady = undefined;
      throw error;
    });
  }
  return globalForDb.__databaseReady;
}
