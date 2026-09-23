import type { Env, TelegramMessage, Update } from '../types';
import { sendMessage, escapeMarkdown } from './telegram';
import { fetchIGN } from './mobapay';
import { 
  getUser, 
  insertClaimLog,
  getPendingByBotMessageId,
  completePendingRequest,
  upsertUser
} from './db';
import { requestAndSendPendingVC } from './vc';

const USAGE_SENDVC = "❌ Invalid Use Of Command!\n💡 Usage: `/sendvc [GameID] [ServerID]`\nExample: `/sendvc 12345678 1234`\nOr use `/link` first.";
const USAGE_CLAIM = "❌ Invalid Use Of Command!\n💡 Full usage: `/claim [GameID] [ServerID] [VCode]`\n💡 Linked usage: `/claim [VCode]`\n💡 Saved usage: `/claim`\n⚠️ Must reply to a CDK message.";

// Helper to check if VC is exhausted
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

export async function handleStart(env: Env, msg: TelegramMessage) {
  const helpText = [
    "🤖 *Mobile Legends Serverless Bot*",
    "",
    "*Commands:*",
    "`/start` — Show welcome/help",
    "`/link [GameID] [ServerID]` — Link account",
    "`/sendvc [GameID] [ServerID]` — Request VC (Reply to save)",
    "`/claim [GameID] [ServerID] [VCode]` — Redeem CDK",
    "`/status` — Show info",
    "`/cancel` — Cancel pending VC",
    "`/clear` — Reset data",
    "",
    "*Flow:*",
    "1. `/link`",
    "2. `/sendvc` -> Bot asks you to REPLY with code",
    "3. Reply with code -> Auto-saved",
    "4. Send CDK -> Reply to CDK with `/claim`",
  ].join("\n");
  
  await sendMessage(env, msg.chat.id, helpText);
}

export async function handleLink(env: Env, msg: TelegramMessage) {
  const args = (msg.text || "").trim().split(/\s+/);
  const gameid = args[1];
  const serverid = args[2];
  const userId = String(msg.from?.id || msg.chat.id);

  if (!gameid || !serverid || !/^\d+$/.test(gameid) || !/^\d+$/.test(serverid)) {
    return sendMessage(env, msg.chat.id, "❌ Usage: `/link [GameID] [ServerID]` (Numbers only)");
  }

  await sendMessage(env, msg.chat.id, `🔁 Checking IGN...`);
  
  const ignResult = await fetchIGN(gameid, serverid);
  if (!ignResult.success || !ignResult.name) {
    return sendMessage(env, msg.chat.id, `❌ Could not verify account: ${escapeMarkdown(ignResult.error || "Unknown")}`);
  }

  await upsertUser(env, {
    telegramId: userId,
    telegramUsername: msg.from?.username || null,
    gameId: gameid,
    serverId: serverid,
    ign: ignResult.name,
    verificationCode: null,
    vcStatus: null,
    vcMessage: "Linked",
  });

  await sendMessage(env, msg.chat.id, 
    `✅ Account linked!\n👤 IGN: *${escapeMarkdown(ignResult.name)}*\n\nUse \`/sendvc\` to start.`
  );
}

export async function handleSendVC(env: Env, msg: TelegramMessage) {
  const args = (msg.text || "").trim().split(/\s+/);
  const userId = String(msg.from?.id || msg.chat.id);
  
  let gameid = args[1];
  let serverid = args[2];

  if (!gameid || !serverid) {
    const saved = await getUser(env, userId);
    if (saved && saved.game_id && saved.server_id) {
      gameid = saved.game_id;
      serverid = saved.server_id;
    } else {
      return sendMessage(env, msg.chat.id, USAGE_SENDVC);
    }
  }

  if (!/^\d+$/.test(gameid!) || !/^\d+$/.test(serverid!)) {
     return sendMessage(env, msg.chat.id, "❌ IDs must be numbers.");
  }

  const saved = await getUser(env, userId);
  let ign = saved?.ign || "Unknown";

  // Refresh IGN if possible, but don't block if it fails slightly differently than link
  try {
    const ignResult = await fetchIGN(gameid!, serverid!);
    if (ignResult.success && ignResult.name) ign = ignResult.name;
  } catch(e) {}

  await requestAndSendPendingVC({
    env,
    botSendMessage: sendMessage,
    chatId: msg.chat.id,
    telegramId: userId,
    telegramUsername: msg.from?.username || null,
    gameId: gameid!,
    serverId: serverid!,
    ign,
    source: "manual",
  });
}

export async function handleClaim(env: Env, msg: TelegramMessage) {
  const userId = String(msg.from?.id || msg.chat.id);
  const args = (msg.text || "").trim().split(/\s+/);
  const reply = msg.reply_to_message;

  if (!reply) {
    return sendMessage(env, msg.chat.id, USAGE_CLAIM);
  }

  const cdk = (reply.text || reply.caption || "").trim();
  if (!cdk) {
    return sendMessage(env, msg.chat.id, "❌ The message you replied to is empty.");
  }

  const saved = await getUser(env, userId);
  let gameid: string | undefined;
  let serverid: string | undefined;
  let vcode: string | undefined;

  if (args.length >= 4) {
    gameid = args[1]; serverid = args[2]; vcode = args[3];
  } else if (args.length >= 2) {
    if (saved?.game_id && saved?.server_id) {
      gameid = saved.game_id; serverid = saved.server_id; vcode = args[1];
    } else {
       return sendMessage(env, msg.chat.id, USAGE_CLAIM);
    }
  } else {
    if (saved?.game_id && saved?.server_id) {
      gameid = saved.game_id; serverid = saved.server_id; vcode = saved.verification_code;
      if (!vcode) {
         return sendMessage(env, msg.chat.id, "❌ No saved VC. Use `/sendvc` then reply with code.");
      }
    } else {
       return sendMessage(env, msg.chat.id, USAGE_CLAIM);
    }
  }

  if (!gameid || !serverid || !vcode) return sendMessage(env, msg.chat.id, USAGE_CLAIM);
  if (!/^\d+$/.test(gameid) || !/^\d+$/.test(serverid) || !/^\d{4,8}$/.test(vcode)) {
    return sendMessage(env, msg.chat.id, "❌ Invalid format.");
  }

  await sendMessage(env, msg.chat.id, `🔁 Checking Account...\n🆔 \`${gameid}\`\n🔰 \`${serverid}\``);

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
    await insertClaimLog(env, {
      telegramId: userId,
      telegramUsername: msg.from?.username || null,
      gameId: gameid, serverId: serverid,
      ign: "Unknown", cdk, vcode,
      status: "IGN_FAILED",
      message: String(ignError || "IGN not found"),
    });
    return sendMessage(env, msg.chat.id, `❌ Invalid Game ID or Server ID!\nReason: ${escapeMarkdown(String(ignError))}`);
  }

  await sendMessage(env, msg.chat.id, `✅ Found IGN: *${escapeMarkdown(ign)}*\n🔁 Trying to Redeem CDK...`);

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
    await insertClaimLog(env, {
      telegramId: userId,
      telegramUsername: msg.from?.username || null,
      gameId: gameid, serverId: serverid,
      ign, cdk, vcode,
      status: "ERROR",
      message: String(apiError),
    });
    return sendMessage(env, msg.chat.id, `❌ Error: ${escapeMarkdown(String(apiError))}`);
  }

  const respcode = apiData?.code?.toString() ?? "UNKNOWN";
  const stat = apiData?.status;
  
  // Simple mapping for display
  const messageMap: Record<string, string> = {
    "0": "Redeemed Successfully!",
    "-20023": "Invalid Game ID",
    "-20024": "Invalid Server ID",
    "-20025": "Mismatch",
    "-20027": "Too Frequent",
    "-20010": "Invalid VC",
    "1405": "Already Redeemed",
  };
  let message = messageMap[respcode] || apiData?.msg || apiData?.message || `Code: ${respcode}`;

  const exhausted = isVcExhausted(respcode, apiData, message, env);
  let autoNote = "";

  if (exhausted) {
    const autoResult = await requestAndSendPendingVC({
      env,
      botSendMessage: sendMessage,
      chatId: msg.chat.id,
      telegramId: userId,
      telegramUsername: msg.from?.username || null,
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

  await insertClaimLog(env, {
    telegramId: userId,
    telegramUsername: msg.from?.username || null,
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

  await sendMessage(env, msg.chat.id, resultMsg);
}

export async function handleStatus(env: Env, msg: TelegramMessage) {
  const userId = String(msg.from?.id || msg.chat.id);
  const row = await getUser(env, userId);

  if (!row) {
    return sendMessage(env, msg.chat.id, "❌ No linked account. Use `/link`.");
  }

  const updatedAt = row.updated_at ? new Date(Number(row.updated_at)).toISOString() : "N/A";
  const latestClaim = await getLatestClaimLog(env, userId);
  
  let claimSection = "";
  if (latestClaim) {
    const claimTime = latestClaim.created_at ? new Date(Number(latestClaim.created_at)).toISOString() : "N/A";
    claimSection = `\n\n🎁 *Last Claim*\n💠 Status: ${escapeMarkdown(latestClaim.status || "N/A")}\n📧 Msg: ${escapeMarkdown(latestClaim.message || "N/A")}\n🕒 Time: \`${claimTime}\``;
  }

  await sendMessage(env, msg.chat.id, 
    `📦 *Saved Info*\n\n` +
    `🆔 Game ID: \`${row.game_id || "Not set"}\`\n` +
    `🔰 Server ID: \`${row.server_id || "Not set"}\`\n` +
    `👤 IGN: *${escapeMarkdown(row.ign || "Not set")}*\n` +
    `🧾 VC: \`${row.verification_code || "None"}\`\n` +
    `💠 VC Status: \`${row.vc_status || "None"}\`\n` +
    `🕒 Updated: \`${updatedAt}\`` +
    claimSection
  );
}

export async function handleCancel(env: Env, msg: TelegramMessage) {
  const userId = String(msg.from?.id || msg.chat.id);
  // Import cancelActivePending from db.ts would be needed here
  // For brevity, assuming we import it in index.ts or pass it
  // Let's assume simple implementation inline or imported
  const { cancelActivePending } = await import('./db'); 
  await cancelActivePending(env, userId);
  await sendMessage(env, msg.chat.id, "🚫 Pending verification request cancelled.");
}

export async function handleClear(env: Env, msg: TelegramMessage) {
  const userId = String(msg.from?.id || msg.chat.id);
  const { deleteUser, cancelActivePending } = await import('./db');
  await deleteUser(env, userId);
  await cancelActivePending(env, userId);
  await sendMessage(env, msg.chat.id, "🗑 Data cleared.");
}

// CRITICAL: Handle replies to pending VC messages
export async function handlePendingCodeReply(env: Env, msg: TelegramMessage): Promise<boolean> {
  if (!msg.reply_to_message) return false;

  const replyMessageId = msg.reply_to_message.message_id;
  const pending = await getPendingByBotMessageId(env, replyMessageId);

  if (!pending) return false;

  const userId = String(msg.from?.id ?? "");
  const chatId = String(msg.chat.id);

  // Security: Only original requester
  if (userId !== String(pending.telegram_id)) {
    return true; // Silently ignore others
  }
  
  // Security: Same chat
  if (chatId !== String(pending.chat_id)) {
    return true;
  }

  if (pending.status !== "pending") {
    await sendMessage(env, msg.chat.id, `ℹ️ Request is already ${pending.status}.`);
    return true;
  }

  if (Number(pending.expires_at) <= Date.now()) {
    await sendMessage(env, msg.chat.id, `⏰ Expired. Use \`/sendvc\` again.`);
    return true;
  }

  const code = String(msg.text || "").trim();
  if (!/^\d{4,8}$/.test(code)) {
    await sendMessage(env, msg.chat.id, `❌ Invalid format. Expected 4-8 digits.`);
    return true;
  }

  try {
    await completePendingRequest(env, pending.id, code);
    await upsertUser(env, {
      telegramId: pending.telegram_id,
      telegramUsername: msg.from?.username || null,
      gameId: pending.game_id,
      serverId: pending.server_id,
      ign: pending.ign,
      verificationCode: code,
      vcStatus: "SAVED",
      vcMessage: "Saved from reply",
    });

    await sendMessage(env, msg.chat.id, 
      `✅ Verification code saved.\n\n` +
      `🆔 Game ID: \`${pending.game_id}\`\n` +
      `🔰 Server ID: \`${pending.server_id}\`\n` +
      `🧾 Code: \`${code}\`\n\n` +
      `Now reply to a CDK message and send:\n\`/claim\``
    );
    return true;
  } catch (error: any) {
    console.error("Save Fail:", error);
    await sendMessage(env, msg.chat.id, `❌ Failed to save: ${error.message}`);
    return true;
  }
}
