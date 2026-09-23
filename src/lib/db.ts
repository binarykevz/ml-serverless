import type { Env } from '../types';

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

  await env.DB.prepare(sql).bind(
    data.telegramId,
    data.telegramUsername ?? null,
    data.gameId ?? null,
    data.serverId ?? null,
    data.ign ?? null,
    data.verificationCode ?? null,
    data.vcStatus ?? null,
    data.vcMessage ?? null,
    Date.now()
  ).run();
}

export async function getUser(env: Env, telegramId: string): Promise<any | null> {
  const result = await env.DB.prepare(
    'SELECT * FROM ml_users WHERE telegram_id = ?'
  ).bind(telegramId).first();
  
  return result;
}

export async function deleteUser(env: Env, telegramId: string) {
  await env.DB.prepare('DELETE FROM ml_users WHERE telegram_id = ?')
    .bind(telegramId).run();
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
  const sql = `
    INSERT INTO claim_logs (
      telegram_id, telegram_username, game_id, server_id, 
      ign, cdk, vcode, status, message, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  await env.DB.prepare(sql).bind(
    data.telegramId,
    data.telegramUsername ?? null,
    data.gameId ?? null,
    data.serverId ?? null,
    data.ign ?? null,
    data.cdk ?? null,
    data.vcode ?? null,
    data.status ?? null,
    data.message ?? null,
    Date.now()
  ).run();
}

export async function getLatestClaimLog(env: Env, telegramId: string): Promise<any | null> {
  const result = await env.DB.prepare(`
    SELECT * FROM claim_logs 
    WHERE telegram_id = ? 
    ORDER BY created_at DESC, id DESC 
    LIMIT 1
  `).bind(telegramId).first();
  
  return result;
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
  const sql = `
    INSERT INTO pending_vc_requests (
      telegram_id, chat_id, game_id, server_id, ign, 
      bot_message_id, status, source, created_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
  `;

  const result = await env.DB.prepare(sql).bind(
    data.telegramId,
    data.chatId,
    data.gameId,
    data.serverId,
    data.ign ?? null,
    data.botMessageId ?? null,
    data.source,
    Date.now(),
    data.expiresAt
  ).run();

  return result.meta?.last_row_id as number | null;
}

export async function getPendingByBotMessageId(env: Env, botMessageId: number): Promise<any | null> {
  const result = await env.DB.prepare(`
    SELECT * FROM pending_vc_requests 
    WHERE bot_message_id = ? 
    ORDER BY id DESC 
    LIMIT 1
  `).bind(botMessageId).first();
  
  return result;
}

export async function getActivePendingByTelegramId(env: Env, telegramId: string): Promise<any | null> {
  const now = Date.now();
  const result = await env.DB.prepare(`
    SELECT * FROM pending_vc_requests 
    WHERE telegram_id = ? AND status = 'pending' AND expires_at > ?
    ORDER BY id DESC 
    LIMIT 1
  `).bind(telegramId, now).first();
  
  return result;
}

export async function getRecentAutoPending(env: Env, telegramId: string, sinceTimestamp: number): Promise<any | null> {
  const result = await env.DB.prepare(`
    SELECT * FROM pending_vc_requests 
    WHERE telegram_id = ? AND source = 'auto' AND created_at > ?
    ORDER BY id DESC 
    LIMIT 1
  `).bind(telegramId, sinceTimestamp).first();
  
  return result;
}

export async function completePendingRequest(env: Env, pendingId: number, code: string) {
  await env.DB.prepare(`
    UPDATE pending_vc_requests 
    SET status = 'completed', code = ?, completed_at = ? 
    WHERE id = ? AND status = 'pending'
  `).bind(code, Date.now(), pendingId).run();
}

export async function cancelActivePending(env: Env, telegramId: string) {
  await env.DB.prepare(`
    UPDATE pending_vc_requests 
    SET status = 'cancelled' 
    WHERE telegram_id = ? AND status = 'pending'
  `).bind(telegramId).run();
}
