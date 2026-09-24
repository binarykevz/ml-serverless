import type { Context } from 'grammy';
import type { Env } from '../types';
import { fetchIGN } from './mobapay';
import { 
  getUser, 
  upsertUser,
  deleteUser,
  insertClaimLog,
  getLatestClaimLog,
  getPendingByBotMessageId,
  completePendingRequest,
  cancelActivePending,
  isUserLinked
} from './db';
import { requestAndSendPendingVC } from './vc';

// Helper for markdown escaping
function escapeMarkdown(text: string): string {
  if (!text) return '';
  return String(text).replace(/[_*`[\]]/g, '\\$&');
}

const USAGE_SENDVC = "❌ Invalid Use Of Command!\n💡 Usage: `/sendvc [GameID] [ServerID]`\nExample: `/sendvc 12345678 1234`\nOr use `/link` first.";
const USAGE_CLAIM = "❌ Invalid Use Of Command!\n💡 Full usage: `/claim [GameID] [ServerID] [VCode]`\n💡 Linked usage: `/claim [VCode]`\n💡 Saved usage: `/claim`\n⚠️ Must reply to a CDK message.";
const USAGE_LINK = "❌ Invalid Use Of Command!\n💡 Usage: `/link [GameID] [ServerID]`\n\n⚠️ You can only link ONE account at a time.\nUse `/unlink` first if you want to change accounts.";

// ✅ UPDATED: Comprehensive Response Messages Map
const responseMessages: Record<string, string> = {
    "-20023": "Invalid Game ID",
    "-20024": "Invalid Server ID",
    "-20025": "Game ID and Server ID do not match",
    "-20027": "Request too Frequent!...",
    "-20010": "Invalid Verification Code!",
    "0": "Redeemed Successfully!",
    "1401": "redeem in specified zone",
    "1402": "This CDKey does not exist",
    "1403": "CDKey expired",
    "1404": "Incorrect format of CDKey",
    "1405": "This CDKey has been redeemed.",
    "1406": "Bound Account CDKey. Incorrect account.",
    "1407": "Exceeds exchange amount limit.",
    "1408": "Can only redeem in specified zone.",
    "1409": "Restriction Requirement Configuration Error",
    "1410": "This CDKey is being redeemed by many players. The Server is processing... Please try again later.",
    "1411": "It's not exchange time, please wait.",
    "1412": "Limit reached for number of people exchanging.",
    "1413": "You are not a new user",
    "1414": "You haven't purchased yet",
    "1415": "Your level is too high",
    "1416": "You can not redeem the CDKey through your channel",
    "1036": "The amount limitation of CDKey redeemption"
};

function isVcExhausted(respcode: string, apiData: any, message: string, env: Env): boolean {
  const configuredCodes = (env.VC_EXHAUSTED_CODES || "").split(",").map(s => s.trim()).filter(Boolean);
  if (configuredCodes.includes(String(respcode))) return true;

  const configuredTexts = (env.VC_EXHAUSTED_TEXT || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  const defaultTexts = ["验证码次数用尽", "次数用尽", "verification code limit", "vcode limit"];
  const texts = [...defaultTexts, ...configuredTexts];

  const haystack = [respcode, apiData?.msg, apiData?.message, apiData?.status, message]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return texts.some(t => haystack.includes(t));
}

export async function handleStart(ctx: Context<Env>) {
  const helpText = [
    "🤖 *Mobile Legends Serverless Bot*",
    "",
    "*Commands:*",
    "`/start` — Show welcome/help",
    "`/help` — Show help",
    "`/link [GameID] [ServerID]` — Link your ML account (Only 1 allowed)",
    "`/unlink` — Remove current link",
    "`/sendvc [GameID] [ServerID]` — Request Verification Code",
    "`/claim [GameID] [ServerID] [VCode]` — Redeem CDK",
    "`/status` — Show saved account info",
    "`/cancel` — Cancel pending verification request",
    "`/clear` — Wipe all data (Danger!)",
    "",
    "*Flow:*",
    "1. `/link` your account.",
    "2. `/sendvc` to get code.",
    "3. Reply to bot message with code (Auto-deletes prompt).",
    "4. Send CDK & Reply with `/claim`.",
  ].join("\n");
  
  await ctx.reply(helpText, { parse_mode: 'Markdown' });
}

export async function handleHelp(ctx: Context<Env>) {
  await handleStart(ctx);
}

export async function handleLink(ctx: Context<Env>) {
  const args = (ctx.message?.text || "").trim().split(/\s+/);
  const gameid = args[1];
  const serverid = args[2];
  const userId = String(ctx.from?.id || ctx.chat.id);

  if (!gameid || !serverid || !/^\d+$/.test(gameid) || !/^\d+$/.test(serverid)) {
    return ctx.reply(USAGE_LINK, { parse_mode: 'Markdown' });
  }

  const alreadyLinked = await isUserLinked(ctx.env, userId);
  if (alreadyLinked) {
    return ctx.reply(
      "⚠️ You are already linked to an account.\n\n" +
      "To switch accounts, please use `/unlink` first.\n" +
      "Check your current link with `/status`.",
      { parse_mode: 'Markdown' }
    );
  }

  // Typing Indicator
  await ctx.api.sendChatAction(ctx.chat.id, 'typing');
  
  const ignResult = await fetchIGN(gameid, serverid);
  if (!ignResult.success || !ignResult.name) {
    return ctx.reply(`❌ Could not verify account: ${escapeMarkdown(ignResult.error || "Unknown")}`, { parse_mode: 'Markdown' });
  }

  await upsertUser(ctx.env, {
    telegramId: userId,
    telegramUsername: ctx.from?.username || null,
    gameId: gameid,
    serverId: serverid,
    ign: ignResult.name,
    verificationCode: null,
    vcStatus: null,
    vcMessage: "Linked",
  });

  await ctx.reply(
    `✅ Account linked successfully!\n\n` +
    `👤 IGN: *${escapeMarkdown(ignResult.name)}*\n` +
    `🆔 Game ID: \`${gameid}\`\n` +
    `🔰 Server ID: \`${serverid}\`\n\n` +
    `You can now use \`/sendvc\` and \`/claim\`.`,
    { parse_mode: 'Markdown' }
  );
}

export async function handleUnlink(ctx: Context<Env>) {
  const userId = String(ctx.from?.id || ctx.chat.id);
  
  const row = await getUser(ctx.env, userId);
  
  if (!row || !row.game_id) {
    return ctx.reply("ℹ️ No account is currently linked.");
  }

  await deleteUser(ctx.env, userId);
  await cancelActivePending(ctx.env, userId);

  await ctx.reply(
    `🗑 Unlinked successfully.\n\n` +
    `Previous Account:\n` +
    `🆔 Game ID: \`${row.game_id}\`\n` +
    `🔰 Server ID: \`${row.server_id}\`\n\n` +
    `You can now use \`/link\` to connect a different account.`,
    { parse_mode: 'Markdown' }
  );
}

export async function handleSendVC(ctx: Context<Env>) {
  const args = (ctx.message?.text || "").trim().split(/\s+/);
  const userId = String(ctx.from?.id || ctx.chat.id);
  
  let gameid = args[1];
  let serverid = args[2];

  if (!gameid || !serverid) {
    const saved = await getUser(ctx.env, userId);
    if (saved && saved.game_id && saved.server_id) {
      gameid = saved.game_id;
      serverid = saved.server_id;
    } else {
      return ctx.reply(USAGE_SENDVC, { parse_mode: 'Markdown' });
    }
  }

  if (!/^\d+$/.test(gameid!) || !/^\d+$/.test(serverid!)) {
     return ctx.reply("❌ IDs must be numbers.");
  }

  const saved = await getUser(ctx.env, userId);
  let ign = saved?.ign || "Unknown";

  // Typing Indicator
  await ctx.api.sendChatAction(ctx.chat.id, 'typing');

  try {
    const ignResult = await fetchIGN(gameid!, serverid!);
    if (ignResult.success && ignResult.name) ign = ignResult.name;
  } catch(e) {}

  await requestAndSendPendingVC(ctx, {
    telegramId: userId,
    gameId: gameid!,
    serverId: serverid!,
    ign,
    source: "manual",
  });
}

export async function handleClaim(ctx: Context<Env>) {
  const userId = String(ctx.from?.id || ctx.chat.id);
  const args = (ctx.message?.text || "").trim().split(/\s+/);
  const reply = ctx.message?.reply_to_message;

  if (!reply) {
    return ctx.reply(USAGE_CLAIM, { parse_mode: 'Markdown' });
  }

  const cdk = (reply.text || reply.caption || "").trim();
  if (!cdk) {
    return ctx.reply("❌ The message you replied to is empty.");
  }

  const saved = await getUser(ctx.env, userId);
  let gameid: string | undefined;
  let serverid: string | undefined;
  let vcode: string | undefined;

  if (args.length >= 4) {
    gameid = args[1]; serverid = args[2]; vcode = args[3];
  } else if (args.length >= 2) {
    if (saved?.game_id && saved?.server_id) {
      gameid = saved.game_id; serverid = saved.server_id; vcode = args[1];
    } else {
       return ctx.reply(USAGE_CLAIM, { parse_mode: 'Markdown' });
    }
  } else {
    if (saved?.game_id && saved?.server_id) {
      gameid = saved.game_id; serverid = saved.server_id; vcode = saved.verification_code;
      if (!vcode) {
         return ctx.reply("❌ No saved VC. Use `/sendvc` then reply with code.");
      }
    } else {
       return ctx.reply(USAGE_CLAIM, { parse_mode: 'Markdown' });
    }
  }

  if (!gameid || !serverid || !vcode) return ctx.reply(USAGE_CLAIM, { parse_mode: 'Markdown' });
  if (!/^\d+$/.test(gameid) || !/^\d+$/.test(serverid) || !/^\d{4,8}$/.test(vcode)) {
    return ctx.reply("❌ Invalid format.");
  }

  // Typing Indicator
  await ctx.api.sendChatAction(ctx.chat.id, 'typing');

  await ctx.reply(`🔁 Checking Account...\n🆔 \`${gameid}\`\n🔰 \`${serverid}\``, { parse_mode: 'Markdown' });

  let ign = saved?.ign || null;
  let ignError = null;

  try {
    const ignResult = await fetchIGN(gameid, serverid);
    if (ignResult.success && ignResult.name) ign = ignResult.name;
    else ignError = ignResult.error;
  } catch (e: any) {
    ignError = e.message;
  }

  if (!ign) {
    await insertClaimLog(ctx.env, {
      telegramId: userId,
      telegramUsername: ctx.from?.username || null,
      gameId: gameid, serverId: serverid,
      ign: "Unknown", cdk, vcode,
      status: "IGN_FAILED",
      message: String(ignError || "IGN not found"),
    });
    return ctx.reply(`❌ Invalid Game ID or Server ID!\nReason: ${escapeMarkdown(String(ignError))}`, { parse_mode: 'Markdown' });
  }

  await ctx.reply(`✅ Found IGN: *${escapeMarkdown(ign)}*\n🔁 Trying to Redeem CDK...`, { parse_mode: 'Markdown' });

  let apiData: any = null;
  let apiError: string | null = null;

  try {
    const response = await fetch("https://api.mobilelegends.com/mlweb/sendCdk", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        referer: "https://www.mobilelegends.com/",
      },
      body: JSON.stringify({
        redeemCode: cdk,
        roleId: gameid,
        zoneId: serverid,
        vCode: vcode,
        language: "en",
      }),
      signal: AbortSignal.timeout(15000),
    });
    apiData = await response.json();
  } catch (error: any) {
    apiError = error.response?.data?.msg || error.response?.data?.message || error.message;
  }

  if (apiError) {
    await insertClaimLog(ctx.env, {
      telegramId: userId,
      telegramUsername: ctx.from?.username || null,
      gameId: gameid, serverId: serverid,
      ign, cdk, vcode,
      status: "ERROR",
      message: String(apiError),
    });
    return ctx.reply(`❌ Error: ${escapeMarkdown(String(apiError))}`, { parse_mode: 'Markdown' });
  }

  const respcode = apiData?.code?.toString() ?? "UNKNOWN";
  const stat = apiData?.status;
  
  // ✅ USE THE COMPREHENSIVE MAP HERE
  let message = responseMessages[respcode];

  // Fallback if code is not in map but API returned a message
  if (!message) {
    const apiMsg = apiData?.msg || apiData?.message;
    if (apiMsg && String(apiMsg) !== respcode) {
      message = String(apiMsg);
    } else {
      message = `Unknown code: ${respcode}`;
    }
  }

  const exhausted = isVcExhausted(respcode, apiData, message, ctx.env);
  let autoNote = "";

  if (exhausted) {
    const autoResult = await requestAndSendPendingVC(ctx, {
      telegramId: userId,
      gameId: gameid,
      serverId: serverid,
      ign,
      source: "auto",
    });

    if (autoResult.requested) {
      autoNote = "\n\n🔄 VC Exhausted. New VC requested automatically.\n👉 Reply to the new bot message with the code, then `/claim` again.";
    } else if (autoResult.reason === "active_pending") {
      autoNote = "\n\n⏳ A VC request is already pending.\n👉 Reply to that pending bot message.";
    } else if (autoResult.reason === "cooldown") {
      autoNote = "\n\n⏳ Auto re-request on cooldown. Wait a bit.";
    } else if (autoResult.error) {
      autoNote = `\n\n⚠️ Auto new VC request failed: ${escapeMarkdown(String(autoResult.error))}`;
    }
  }

  const logMessage = String(message) + (exhausted ? " | Auto-VC triggered" : "");

  await insertClaimLog(ctx.env, {
    telegramId: userId,
    telegramUsername: ctx.from?.username || null,
    gameId: gameid, serverId: serverid,
    ign, cdk, vcode,
    status: String(stat ?? ""),
    message: logMessage,
  });

  const resultMsg = 
    `💠 *Kevz Bot x Redeemer* 💠\n\n` +
    `🆔 Game Id: \`${gameid}\`\n` +
    `🔰 Server Id: \`${serverid}\`\n` +
    `👤 IGN: *${escapeMarkdown(ign)}*\n` +
    `💠 Status: ${escapeMarkdown(String(stat ?? "N/A"))}\n` +
    `📧 Message: ${escapeMarkdown(String(message))}` +
    autoNote +
    `\n\n🧾 Claim attempt saved to Turso/D1.`;

  await ctx.reply(resultMsg, { parse_mode: 'Markdown' });
}

export async function handleStatus(ctx: Context<Env>) {
  const userId = String(ctx.from?.id || ctx.chat.id);
  const row = await getUser(ctx.env, userId);

  if (!row) {
    return ctx.reply("❌ No linked account. Use `/link [GameID] [ServerID]`.", { parse_mode: 'Markdown' });
  }

  const updatedAt = row.updated_at ? new Date(Number(row.updated_at)).toISOString() : "N/A";
  const latestClaim = await getLatestClaimLog(ctx.env, userId);
  
  let claimSection = "";
  if (latestClaim) {
    const claimTime = latestClaim.created_at ? new Date(Number(latestClaim.created_at)).toISOString() : "N/A";
    claimSection = `\n\n🎁 *Last Claim*\n💠 Status: ${escapeMarkdown(latestClaim.status || "N/A")}\n📧 Msg: ${escapeMarkdown(latestClaim.message || "N/A")}\n🕒 Time: \`${claimTime}\``;
  }

  await ctx.reply(
    `📦 *Saved Info*\n\n` +
    `🆔 Game ID: \`${row.game_id || "Not set"}\`\n` +
    `🔰 Server ID: \`${row.server_id || "Not set"}\`\n` +
    `👤 IGN: *${escapeMarkdown(row.ign || "Not set")}*\n` +
    `🧾 VC: \`${row.verification_code || "None"}\`\n` +
    `💠 VC Status: \`${row.vc_status || "None"}\`\n` +
    `🕒 Updated: \`${updatedAt}\`` +
    claimSection,
    { parse_mode: 'Markdown' }
  );
}

export async function handleCancel(ctx: Context<Env>) {
  const userId = String(ctx.from?.id || ctx.chat.id);
  await cancelActivePending(ctx.env, userId);
  await ctx.reply("🚫 Pending verification request cancelled.");
}

export async function handleClear(ctx: Context<Env>) {
  const userId = String(ctx.from?.id || ctx.chat.id);
  await deleteUser(ctx.env, userId);
  await cancelActivePending(ctx.env, userId);
  await ctx.reply("🗑 All data cleared. Use `/link` to start over.");
}

// UPDATED REPLY HANDLER WITH AUTO-DELETE USING GRAMMY
export async function handlePendingCodeReply(ctx: Context<Env>): Promise<boolean> {
  if (!ctx.message?.reply_to_message) return false;

  const replyMessageId = ctx.message.reply_to_message.message_id;
  const pending = await getPendingByBotMessageId(ctx.env, replyMessageId);

  if (!pending) return false;

  const userId = String(ctx.from?.id ?? "");
  const chatId = String(ctx.chat.id);

  if (userId !== String(pending.telegram_id)) return true;
  if (chatId !== String(pending.chat_id)) return true;
  if (pending.status !== "pending") return true;
  if (Number(pending.expires_at) <= Date.now()) {
    await ctx.reply(`⏰ Expired. Use \`/sendvc\` again.`);
    return true;
  }

  const code = String(ctx.message.text || "").trim();
  if (!/^\d{4,8}$/.test(code)) {
    await ctx.reply(`❌ Invalid format. Expected 4-8 digits.`);
    return true;
  }

  try {
    await completePendingRequest(ctx.env, pending.id, code);
    
    await upsertUser(ctx.env, {
      telegramId: pending.telegram_id,
      telegramUsername: ctx.from?.username || null,
      gameId: pending.game_id,
      serverId: pending.server_id,
      ign: pending.ign,
      verificationCode: code,
      vcStatus: "SAVED",
      vcMessage: "Saved from reply",
    });

    await ctx.reply(
      `✅ Verification code saved.\n\n` +
      `🆔 Game ID: \`${pending.game_id}\`\n` +
      `🔰 Server ID: \`${pending.server_id}\`\n` +
      `🧾 Code: \`${code}\`\n\n` +
      `Now reply to a CDK message and send:\n\`/claim\``,
      { parse_mode: 'Markdown' }
    );

    // AUTO-DELETE THE ORIGINAL PROMPT MESSAGE
    await ctx.deleteMessage(replyMessageId);

    return true;
  } catch (error: any) {
    console.error("Save Fail:", error);
    await ctx.reply(`❌ Failed to save: ${error.message}`);
    return true;
  }
}
