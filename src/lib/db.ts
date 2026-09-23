import { createClient, type Client } from "@libsql/client";
import type { Env } from "../types";

let dbClient: Client | null = null;

/**
 * Initialize or retrieve the cached Turso client.
 */
function getClient(env: Env): Client {
  if (!dbClient) {
    const url = env.TURSO_DATABASE_URL;
    const authToken = env.TURSO_AUTH_TOKEN;

    if (!url || !authToken) {
      throw new Error("Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN");
    }

    dbClient = createClient({
      url,
      authToken,
    });
  }
  return dbClient;
}

/**
 * Ensure tables exist. Call this once during cold start or before first query.
 * For simplicity in this example, we assume schema.sql has been run manually 
 * against the Turso DB. If you want auto-migration, uncomment below.
 */
export async function initDb(env: Env) {
  const db = getClient(env);
  
  // Optional: Auto-create tables if they don't exist
  /*
  await db.execute(`
    CREATE TABLE IF NOT EXISTS ml_users (
      telegram_id TEXT PRIMARY KEY,
      telegram_username TEXT,
      game_id TEXT,
      server_id TEXT,
      ign TEXT,
      verification_code TEXT,
      vc_status TEXT,
      vc_message TEXT,
      updated_at INTEGER NOT NULL
    );
  `);
  */
}

// --- User Operations ---

export async function upsertUser(env: Env, data: {
  telegramId: string;
  telegramUsername?: string | null;
  gameId?: string | null;
  serverId?: string | null;
  ign?: string | null;
  verificationCode?: string | null;
  vcStatus?: string | null;
  vcMessage?: string | null;
}) {
  const db = getClient(env);
  
  const sql = `
    INSERT INTO ml_users (
      telegram_id, telegram_username, game_id, server_id, 
      ign, verification_code, vc_status, vc_message, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(telegram_id) DO UPDATE SET
      telegram_username = excluded.telegram_username,
      game_id = excluded.game_id,
      server_id = excluded.server_id,
      ign = excluded.ign,
      verification_code = excluded.verification_code,
      vc_status = excluded.vc_status,
      vc_message = excluded.vc_message,
      updated_at = excluded.updated_at
  `;

  await db.execute({
    sql,
    args: [
      data.telegramId,
      data.telegramUsername ?? null,
      data.gameId ?? null,
      data.serverId ?? null,
      data.ign ?? null,
      data.verificationCode ?? null,
      data.vcStatus ?? null,
      data.vcMessage ?? null,
      Date.now(),
    ],
  });
}

export async function getUser(env: Env, telegramId: string): Promise<any | null> {
  const db = getClient(env);
  
  const result = await db.execute({
    sql: 'SELECT * FROM ml_users WHERE telegram_id = ?',
    args: [telegramId],
  });

  return result.rows[0] ?? null;
}

export async function deleteUser(env: Env, telegramId: string) {
  const db = getClient(env);
  await db.execute({
    sql: 'DELETE FROM ml_users WHERE telegram_id = ?',
    args: [telegramId],
  });
}

// --- Claim Log Operations ---

export async function insertClaimLog(env: Env, data: {
  telegramId: string;
  telegramUsername?: string | null;
  gameId?: string | null;
  serverId?: string | null;
  ign?: string | null;
  cdk?: string | null;
  vcode?: string | null;
  status?: string | null;
  message?: string | null;
}) {
  const db = getClient(env);
  
  const sql = `
    INSERT INTO claim_logs (
      telegram_id, telegram_username, game_id, server_id, 
      ign, cdk, vcode, status, message, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  await db.execute({
    sql,
    args: [
      data.telegramId,
      data.telegramUsername ?? null,
      data.gameId ?? null,
      data.serverId ?? null,
      data.ign ?? null,
      data.cdk ?? null,
      data.vcode ?? null,
      data.status ?? null,
      data.message ?? null,
      Date.now(),
    ],
  });
}

export async function getLatestClaimLog(env: Env, telegramId: string): Promise<any | null> {
  const db = getClient(env);
  
  const result = await db.execute({
    sql: `
      SELECT * FROM claim_logs 
      WHERE telegram_id = ? 
      ORDER BY created_at DESC, id DESC 
      LIMIT 1
    `,
    args: [telegramId],
  });
  
  return result.rows[0] ?? null;
}

// --- Pending VC Operations ---

export async function createPendingRequest(env: Env, data: {
  telegramId: string;
  chatId: string;
  gameId: string;
  serverId: string;
  ign?: string | null;
  botMessageId?: number | null;
  source: string;
  expiresAt: number;
}): Promise<number | null> {
  const db = getClient(env);
  
  const sql = `
    INSERT INTO pending_vc_requests (
      telegram_id, chat_id, game_id, server_id, ign, 
      bot_message_id, status, source, created_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
  `;

  const result = await db.execute({
    sql,
    args: [
      data.telegramId,
      data.chatId,
      data.gameId,
      data.serverId,
      data.ign ?? null,
      data.botMessageId ?? null,
      data.source,
      Date.now(),
      data.expiresAt,
    ],
  });

  // libsql returns lastInsertRowid as bigint or number depending on config
  return Number(result.lastInsertRowid);
}

export async function getPendingByBotMessageId(env: Env, botMessageId: number): Promise<any | null> {
  const db = getClient(env);
  
  const result = await db.execute({
    sql: `
      SELECT * FROM pending_vc_requests 
      WHERE bot_message_id = ? 
      ORDER BY id DESC 
      LIMIT 1
    `,
    args: [botMessageId],
  });
  
  return result.rows[0] ?? null;
}

export async function getActivePendingByTelegramId(env: Env, telegramId: string): Promise<any | null> {
  const db = getClient(env);
  const now = Date.now();
  
  const result = await db.execute({
    sql: `
      SELECT * FROM pending_vc_requests 
      WHERE telegram_id = ? AND status = 'pending' AND expires_at > ?
      ORDER BY id DESC 
      LIMIT 1
    `,
    args: [telegramId, now],
  });
  
  return result.rows[0] ?? null;
}

export async function getRecentAutoPending(env: Env, telegramId: string, sinceTimestamp: number): Promise<any | null> {
  const db = getClient(env);
  
  const result = await db.execute({
    sql: `
      SELECT * FROM pending_vc_requests 
      WHERE telegram_id = ? AND source = 'auto' AND created_at > ?
      ORDER BY id DESC 
      LIMIT 1
    `,
    args: [telegramId, sinceTimestamp],
  });
  
  return result.rows[0] ?? null;
}

export async function completePendingRequest(env: Env, pendingId: number, code: string) {
  const db = getClient(env);
  
  await db.execute({
    sql: `
      UPDATE pending_vc_requests 
      SET status = 'completed', code = ?, completed_at = ? 
      WHERE id = ? AND status = 'pending'
    `,
    args: [code, Date.now(), pendingId],
  });
}

export async function cancelActivePending(env: Env, telegramId: string) {
  const db = getClient(env);
  
  await db.execute({
    sql: `
      UPDATE pending_vc_requests 
      SET status = 'cancelled' 
      WHERE telegram_id = ? AND status = 'pending'
    `,
    args: [telegramId],
  });
}
