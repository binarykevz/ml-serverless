import type { Context } from 'grammy';
import type { Env } from '../types';
import { escapeMarkdown } from './telegram'; // Ensure this helper exists
import { 
  upsertUser, 
  getActivePendingByTelegramId, 
  getRecentAutoPending,
  createPendingRequest 
} from './db';

// Restore Missing Constants
const PENDING_TTL_MS = 10 * 60 * 1000; // 10 minutes
const AUTO_COOLDOWN_MS = 60 * 1000; // 1 minute

const BLOCKING_VC_CODES = new Set(['-20023', '-20024', '-20025', '-20027', '9601']);

const responseMessages: Record<string, string> = {
  "9601": "Error sending and receiving vcode",
  "-20023": "Invalid Game ID",
  "-20024": "Invalid Server ID",
  "-20025": "Game ID and Server ID do not match",
  "-20027": "Request too Frequent!...",
  "-20028": "Verification code already sent...",
  "-20010": "Invalid Verification Code!",
  "0": "Verification Code Sent Successfully!",
};

function parseSendVcResponse(apiData: any) {
  const respcode = apiData?.code?.toString() ?? "UNKNOWN";
  const stat = apiData?.status;
  let message = responseMessages[respcode];
  if (!message) {
    const apiMsg = apiData?.msg || apiData?.message;
    if (apiMsg && String(apiMsg) !== respcode) {
      message = String(apiMsg);
    } else {
      message = `Unknown code: ${respcode}`;
    }
  }
  return { respcode, stat, message };
}

async function callSendMail(gameId: string, serverId: string) {
  try {
    const response = await fetch("https://api.mobilelegends.com/mlweb/sendMail", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        referer: "https://www.mobilelegends.com/",
      },
      body: JSON.stringify({
        roleId: gameId,
        zoneId: serverId,
        language: "en",
      }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await response.json() as any;
    return { apiData: data, error: null };
  } catch (error: any) {
    const rawError = error.response?.data?.msg || error.response?.data?.message || error.message;
    const errorMessage = typeof rawError === "string" ? rawError : JSON.stringify(rawError);
    return { apiData: null, error: errorMessage };
  }
}

/**
 * Expects ctx to have env injected via index.ts
 */
export async function requestAndSendPendingVC(ctx: Context & { env: Env }, params: {
  telegramId: string;
  gameId: string;
  serverId: string;
  ign: string;
  source?: "manual" | "auto";
}) {
  const { telegramId, gameId, serverId, ign, source = "manual" } = params;
  const env = ctx.env;
  const now = Date.now();

  try {
    const active = await getActivePendingByTelegramId(env, telegramId);
    if (active) {
      const expiresUnix = Math.floor(Number(active.expires_at) / 1000);
      await ctx.reply(
        `⏳ You already have a pending verification code request.\n\n` +
        `👉 Reply to message ID \`${active.bot_message_id}\` with the code.\n` +
        `🆔 Game ID: \`${active.game_id}\`\n` +
        `🔰 Server ID: \`${active.server_id}\`\n` +
        `⏳ Expires: <t:${expiresUnix}:R>`,
        { parse_mode: 'Markdown' }
      );
      return { requested: false, reason: "active_pending", pending: active };
    }

    if (source === "auto") {
      const recentAuto = await getRecentAutoPending(env, telegramId, now - AUTO_COOLDOWN_MS);
      if (recentAuto) {
        const retryUnix = Math.floor((Number(recentAuto.created_at) + AUTO_COOLDOWN_MS) / 1000);
        await ctx.reply(
          `⏳ An automatic new verification code was requested recently.\n\n` +
          `Please wait before requesting another one.\n` +
          `🕒 Try again: <t:${retryUnix}:R>`,
          { parse_mode: 'Markdown' }
        );
        return { requested: false, reason: "cooldown", pending: recentAuto };
      }
    }

    const { apiData, error } = await callSendMail(gameId, serverId);
    if (error) {
      await ctx.reply(`❌ Failed to request verification code.\nReason: ${escapeMarkdown(error)}`, { parse_mode: 'Markdown' });
      return { requested: false, error };
    }

    const parsed = parseSendVcResponse(apiData);

    if (BLOCKING_VC_CODES.has(parsed.respcode)) {
      await ctx.reply(
        `❌ Verification code request failed.\n\n` +
        `🆔 Game ID: \`${gameId}\`\n` +
        `🔰 Server ID: \`${serverId}\`\n` +
        `📧 Message: ${escapeMarkdown(parsed.message)}`,
        { parse_mode: 'Markdown' }
      );
      return { requested: false, error: parsed.message, apiData, parsed };
    }

    await upsertUser(env, {
      telegramId,
      telegramUsername: ctx.from?.username || null,
      gameId,
      serverId,
      ign,
      verificationCode: null,
      vcStatus: "PENDING_REPLY",
      vcMessage: parsed.message,
    });

    const expiresAt = now + PENDING_TTL_MS;
    const expiresUnix = Math.floor(expiresAt / 1000);

    const pendingText =
      `📩 *Verification Code Requested*\n\n` +
      `🆔 Game ID: \`${gameId}\`\n` +
      `🔰 Server ID: \`${serverId}\`\n` +
      `👤 IGN: *${escapeMarkdown(ign || "Unknown")}*\n` +
      `📧 API Message: ${escapeMarkdown(parsed.message)}\n\n` +
      `✅ Check your Mobile Legends in-game mail.\n` +
      `👉 *Reply to this message* with the verification code.\n` +
      `🔐 Only Telegram user ID \`${telegramId}\` can submit this code.\n` +
      `⏳ Expires: <t:${expiresUnix}:R>`;

    const sentMsg = await ctx.reply(pendingText, { parse_mode: 'Markdown' });
    const botMessageId = sentMsg.message_id;

    if (!botMessageId) {
      return { requested: false, error: "Could not get Telegram message ID." };
    }

    try {
      // FIX: Safe access to chat.id
      const chatId = ctx.chat?.id;
      if (!chatId) throw new Error("Chat ID missing");

      await createPendingRequest(env, {
        telegramId,
        chatId: String(chatId),
        gameId,
        serverId,
        ign,
        botMessageId,
        source,
        expiresAt,
      });
    } catch (dbError: any) {
      await ctx.reply(`⚠️ Verification code was requested, but saving the pending request failed.\nReason: ${escapeMarkdown(dbError.message)}`, { parse_mode: 'Markdown' });
      return { requested: false, error: dbError.message };
    }

    return { requested: true, botMessageId, apiData, parsed };

  } catch (error: any) {
    console.error("❌ [VC] requestAndSendPendingVC error:", error);
    await ctx.reply(`❌ Unexpected verification code request error: ${escapeMarkdown(error.message)}`).catch(() => {});
    return { requested: false, error: error.message };
  }
}
