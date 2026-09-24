import { Hono } from 'hono';
import { Bot } from 'grammy';
import type { Env } from './types';
import { 
  handleStart, 
  handleHelp,
  handleLink, 
  handleUnlink,
  handleSendVC, 
  handleClaim, 
  handleStatus, 
  handleCancel, 
  handleClear,
  handlePendingCodeReply 
} from './lib/handlers';

const app = new Hono<{ Bindings: Env }>();
  // Initialize Bot WITHOUT auto-init
  const bot = new Bot(env.TELEGRAM_BOT_TOKEN, {
    botInfo: {
      id: 0,
      is_bot: true,
      first_name: "Truffle Bot",
      username: "itskevz_bot",
      can_join_groups: true,
      can_read_all_group_messages: false,
      supports_inline_queries: false,
      // Add these missing fields required by newer Grammy types
      can_connect_to_business: false,
      has_main_web_app: false,
      has_topics_enabled: false,
      allows_users_to_create_topics: false,
      can_manage_bots: false, 
      // If there are more errors, you can use 'as any' below instead
    } as any 
  });

app.post('/', async (c) => {
  const env = c.env;
  
  // Verify Secret Token
  const secret = c.req.header('X-Telegram-Bot-Api-Secret-Token');
  if (env.TELEGRAM_WEBHOOK_SECRET && secret !== env.TELEGRAM_WEBHOOK_SECRET) {
    return c.text('Unauthorized', 401);
  }

  let update;
  try {
    update = await c.req.json();
  } catch (e) {
    return c.text('Bad Request', 400);
  }

  // Initialize Bot WITHOUT auto-init to prevent "Bot not initialized" errors
  // We pass an empty object or null to skip the getMe call
  const bot = new Bot(env.TELEGRAM_BOT_TOKEN, {
    botInfo: {
      id: 0, // Dummy ID
      is_bot: true,
      first_name: "ML Bot",
      username: "ml_telegram_bot", // Dummy username
      can_join_groups: true,
      can_read_all_group_messages: false,
      supports_inline_queries: false,
    }
  });

  bot.catch(async (err) => {
    console.error('Global Bot Error:', err);
  });

  // Helper to inject env into context
  const wrapHandler = (handler: Function) => {
    return async (ctx: any) => {
      ctx.env = env;
      await handler(ctx);
    };
  };

  // Manual Command Routing instead of bot.command() to avoid init checks
  bot.on('message:text', async (ctx: any) => {
    ctx.env = env;
    
    const text = ctx.message?.text || "";
    const args = text.trim().split(/\s+/);
    const cmd = args[0].toLowerCase().split('@')[0];

    // Handle Verification Code Replies (Non-commands)
    if (!cmd.startsWith('/')) {
      const handled = await handlePendingCodeReply(ctx);
      if (handled) return;
      return; // Ignore other non-command texts
    }

    // Route Commands
    switch (cmd) {
      case '/start':
        await handleStart(ctx);
        break;
      case '/help':
        await handleHelp(ctx);
        break;
      case '/link':
        await handleLink(ctx);
        break;
      case '/unlink':
        await handleUnlink(ctx);
        break;
      case '/sendvc':
        await handleSendVC(ctx);
        break;
      case '/claim':
      case '/redeem':
        await handleClaim(ctx);
        break;
      case '/status':
        await handleStatus(ctx);
        break;
      case '/cancel':
        await handleCancel(ctx);
        break;
      case '/clear':
        await handleClear(ctx);
        break;
      default:
        // Unknown command
        break;
    }
  });

  try {
    await bot.handleUpdate(update);
  } catch (error: any) {
    console.error('Error processing update:', error);
  }

  return c.text('OK', 200);
});

export default app;
