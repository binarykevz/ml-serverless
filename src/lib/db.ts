import { createClient, type Client } from "@libsql/client";
import type { Env } from "../types";

let dbClient: Client | null = null;

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

export async function isUserLinked(env: Env, telegramId: string): Promise<boolean> {
  const db = getClient(env);
  const result = await db.execute({
    sql: 'SELECT COUNT(*) as count FROM ml_users WHERE telegram_id = ? AND game_id IS NOT NULL',
    args: [telegramId],
  });
  return Number(result.rows[0]?.count || 0) > 0;
}

// --- Claim Logs ---

export async function insertClaimLog(env: Env, data: any) {
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
    sql: `SELECT * FROM claim_logs WHERE telegram_id = ? ORDER BY created_at DESC LIMIT 1`,
    args: [telegramId],
  });
  return result.rows[0] ?? null;
}

// --- Pending VC Requests ---

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
  return Number(result.lastInsertRowid);
}

export async function getPendingByBotMessageId(env: Env, botMessageId: number): Promise<any | null> {
  const db = getClient(env);
  const result = await db.execute({
    sql: `SELECT * FROM pending_vc_requests WHERE bot_message_id = ? ORDER BY id DESC LIMIT 1`,
    args: [botMessageId],
  });
  return result.rows[0] ?? null;
}

export async function getActivePendingByTelegramId(env: Env, telegramId: string): Promise<any | null> {
  const db = getClient(env);
  const now = Date.now();
  const result = await db.execute({
    sql: `SELECT * FROM pending_vc_requests WHERE telegram_id = ? AND status = 'pending' AND expires_at > ? ORDER BY id DESC LIMIT 1`,
    args: [telegramId, now],
  });
  return result.rows[0] ?? null;
}

export async function getRecentAutoPending(env: Env, telegramId: string, sinceTimestamp: number): Promise<any | null> {
  const db = getClient(env);
  const result = await db.execute({
    sql: `SELECT * FROM pending_vc_requests WHERE telegram_id = ? AND source = 'auto' AND created_at > ? ORDER BY id DESC LIMIT 1`,
    args: [telegramId, sinceTimestamp],
  });
  return result.rows[0] ?? null;
}

export async function completePendingRequest(env: Env, pendingId: number, code: string) {
  const db = getClient(env);
  await db.execute({
    sql: `UPDATE pending_vc_requests SET status = 'completed', code = ?, completed_at = ? WHERE id = ? AND status = 'pending'`,
    args: [code, Date.now(), pendingId],
  });
}

export async function cancelActivePending(env: Env, telegramId: string) {
  const db = getClient(env);
  await db.execute({
    sql: `UPDATE pending_vc_requests SET status = 'cancelled' WHERE telegram_id = ? AND status = 'pending'`,
    args: [telegramId],
  });
}
