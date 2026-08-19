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

const rawDatabaseUrl = process.env.DATABASE_URL?.trim();

if (!rawDatabaseUrl) {
  throw new Error("DATABASE_URL belum diset. Tambahkan DATABASE_URL pada Railway Variables.");
}

// DATABASE_URL is intentionally provider-neutral: Railway PostgreSQL and
// Neon PostgreSQL both use standard PostgreSQL connection URIs. Neon pooled
// URLs normally contain sslmode=require (and may contain channel_binding=require).
// We keep the URI intact and enable node-postgres channel binding explicitly.
let databaseUrl = rawDatabaseUrl;
let useSsl = false;
let enableChannelBinding = false;
try {
  const parsed = new URL(rawDatabaseUrl);
  const host = parsed.hostname.toLowerCase();
  const sslMode = parsed.searchParams.get("sslmode")?.toLowerCase();
  const channelBinding = parsed.searchParams.get("channel_binding")?.toLowerCase();
  const isNeon = host.endsWith(".neon.tech") || host.includes(".neon.tech");
  useSsl = isNeon || sslMode === "require" || sslMode === "verify-ca" || sslMode === "verify-full";
  enableChannelBinding = isNeon || channelBinding === "require";

  // Railway private PostgreSQL uses the *.railway.internal network. Do not
  // force TLS there because the private connection is already handled by Railway.
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

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
  __initializedDb?: boolean;
  __databaseReady?: Promise<void>;
};

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: databaseUrl,
    ssl: useSsl ? { rejectUnauthorized: false } : false,
    enableChannelBinding,
    max: 10,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
  });

if (process.env.NODE_ENV !== "production") {
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
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('water-ai-cloud-schema'))`);

    const usersId = await client.query(`
      SELECT data_type, udt_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'users'
        AND column_name = 'id'
      LIMIT 1
    `);

    if (!usersId.rows.length) {
      await client.query("COMMIT");
      return;
    }

    const usersIdType = String(usersId.rows[0].udt_name || "").toLowerCase();

    // The current application uses UUID user IDs. Older deployments of this
    // project used BIGINT/INTEGER IDs. Neon is normal PostgreSQL, so migrate
    // the existing numeric IDs in-place instead of refusing to start.
    if (["int2", "int4", "int8", "numeric"].includes(usersIdType)) {
      console.warn(`[DB MIGRATION] users.id is ${usersIdType}; migrating existing user IDs to UUID.`);

      await client.query(`
        CREATE TEMP TABLE _wac_user_id_map (
          old_id TEXT PRIMARY KEY,
          new_id UUID NOT NULL
        ) ON COMMIT DROP;
      `);
      await client.query(`
        INSERT INTO _wac_user_id_map (old_id, new_id)
        SELECT id::text, gen_random_uuid()
        FROM public.users;
      `);

      // Drop every FK that currently points to users.id. We recreate them
      // after the columns are converted to UUID.
      await client.query(`
        DO $$
        DECLARE r RECORD;
        BEGIN
          FOR r IN
            SELECT conrelid::regclass AS table_name, conname
            FROM pg_constraint
            WHERE contype = 'f'
              AND confrelid = 'public.users'::regclass
          LOOP
            EXECUTE format('ALTER TABLE %s DROP CONSTRAINT IF EXISTS %I', r.table_name, r.conname);
          END LOOP;
        END $$;
      `);

      // Convert every public.*.user_id numeric column that belongs to the
      // old schema. Data is preserved through the temporary ID mapping.
      const childColumns = await client.query(`
        SELECT table_name, udt_name, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND column_name = 'user_id'
          AND udt_name IN ('int2', 'int4', 'int8', 'numeric')
          AND table_name <> 'users'
        ORDER BY table_name
      `);

      for (const row of childColumns.rows) {
        const table = quoteIdent(String(row.table_name));
        const nullable = String(row.is_nullable) === "YES";
        const tempColumn = quoteIdent("__wac_user_id_uuid");

        await client.query(`ALTER TABLE ${table} ADD COLUMN ${tempColumn} UUID`);
        await client.query(`
          UPDATE ${table} t
          SET ${tempColumn} = m.new_id
          FROM _wac_user_id_map m
          WHERE t.user_id::text = m.old_id
        `);

        const missing = await client.query(`
          SELECT COUNT(*)::int AS count
          FROM ${table}
          WHERE user_id IS NOT NULL AND ${tempColumn} IS NULL
        `);
        if (Number(missing.rows[0]?.count || 0) > 0) {
          throw new Error(`Database migration gagal: ${row.table_name}.user_id memiliki ID user yang tidak ditemukan di public.users.`);
        }

        if (!nullable) await client.query(`ALTER TABLE ${table} ALTER COLUMN ${tempColumn} SET NOT NULL`);
        await client.query(`ALTER TABLE ${table} DROP COLUMN user_id`);
        await client.query(`ALTER TABLE ${table} RENAME COLUMN __wac_user_id_uuid TO user_id`);
      }

      // Replace users.id itself while preserving every user row and all of
      // its non-ID data (username, email, password hash, role, etc.).
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
    } else if (usersIdType !== "uuid") {
      throw new Error(
        `Skema database tidak kompatibel: public.users.id bertipe ${usersId.rows[0].data_type}. ` +
        `Aplikasi membutuhkan UUID atau BIGINT/INTEGER yang dapat dimigrasikan.`
      );
    }

    // Auth/session tables are disposable. If they still have a non-UUID
    // user_id after migration, recreate them with the current UUID schema.
    const authTables = ["password_resets", "email_verifications", "sessions"];
    for (const tableName of authTables) {
      const column = await client.query(
        `SELECT udt_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'user_id' LIMIT 1`,
        [tableName]
      );
      if (column.rows.length && String(column.rows[0].udt_name) !== "uuid") {
        await client.query(`DROP TABLE IF EXISTS ${quoteIdent(tableName)} CASCADE`);
      }
    }

    // Recreate FKs for every UUID user_id column where existing values are
    // valid. This keeps the database relational without blocking startup on
    // unrelated legacy rows.
    const uuidChildren = await client.query(`
      SELECT c.table_name, c.is_nullable
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.column_name = 'user_id'
        AND c.udt_name = 'uuid'
        AND c.table_name <> 'users'
      ORDER BY c.table_name
    `);

    for (const row of uuidChildren.rows) {
      const tableName = String(row.table_name);
      const table = quoteIdent(tableName);
      const constraintName = quoteIdent(`${tableName}_user_id_users_id_fkey`);
      const existing = await client.query(`
        SELECT 1 FROM pg_constraint
        WHERE conname = $1 AND conrelid = $2::regclass LIMIT 1
      `, [`${tableName}_user_id_users_id_fkey`, `public.${tableName}`]);
      if (existing.rows.length) continue;

      const invalid = await client.query(`
        SELECT COUNT(*)::int AS count
        FROM ${table} t
        LEFT JOIN public.users u ON u.id = t.user_id
        WHERE t.user_id IS NOT NULL AND u.id IS NULL
      `);
      if (Number(invalid.rows[0]?.count || 0) > 0) {
        console.warn(`[DB MIGRATION] Skipping FK on ${tableName}.user_id because legacy orphan rows exist.`);
        continue;
      }

      const nullable = String(row.is_nullable) === "YES";
      const onDelete = tableName === "logs" || tableName === "ticket_messages" || tableName === "webhook_events" || tableName === "api_request_log" ? "SET NULL" : "CASCADE";
      // SET NULL is only valid for nullable columns.
      const action = onDelete === "SET NULL" && !nullable ? "CASCADE" : onDelete;
      await client.query(`
        ALTER TABLE ${table}
        ADD CONSTRAINT ${constraintName}
        FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE ${action}
      `);
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

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

    // Repair legacy schema mismatches before CREATE TABLE statements that
    // contain UUID foreign keys. This specifically fixes the Railway error:
    // "foreign key constraint password_resets_user_id_fkey cannot be implemented".
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

