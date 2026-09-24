// src/lib/vc.ts
import type { MyContext } from '../types'; // Import custom context
import { escapeMarkdown } from './telegram'; // Ensure this helper exists or inline it
import { 
  upsertUser, 
  getActivePendingByTelegramId, 
  getRecentAutoPending,
  createPendingRequest 
} from './db';

// ... (keep constants like PENDING_TTL_MS, BLOCKING_VC_CODES, etc.) ...

/**
 * Refactored to use MyContext
 */
export async function requestAndSendPendingVC(ctx: MyContext, params: {
  telegramId: string;
  gameId: string;
  serverId: string;
  ign: string;
  source?: "manual" | "auto";
}) {
  const { telegramId, gameId, serverId, ign, source = "manual" } = params;
  const env = ctx.env; // Access env from context
  const now = Date.now();

  try {
    // Check Active Pending
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

    // Cooldown Check
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

    // Call API
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

    // Update User State
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

    // Send Message & Get ID
    const sentMsg = await ctx.reply(pendingText, { parse_mode: 'Markdown' });
    const botMessageId = sentMsg.message_id;

    if (!botMessageId) {
      return { requested: false, error: "Could not get Telegram message ID." };
    }

    // Save Pending State
    try {
      await createPendingRequest(env, {
        telegramId,
        chatId: String(ctx.chat.id),
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
