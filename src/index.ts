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

// Initialize Hono app
const app = new Hono<{ Bindings: Env }>();

// Initialize Grammy Bot
// Note: We create this inside the module scope so it persists across warm starts if possible,
// but in CF Workers, env vars are only available per-request. 
// So we initialize it INSIDE the handler but keep logic clean.
let botInstance: Bot<Env> | null = null;

app.post('/', async (c) => {
  const env = c.env;
  
  // Verify Secret Token
  const secret = c.req.header('X-Telegram-Bot-Api-Secret-Token');
  if (env.TELEGRAM_WEBHOOK_SECRET && secret !== env.TELEGRAM_WEBHOOK_SECRET) {
    return c.text('Unauthorized', 401);
  }

  // Parse Body manually to avoid double-parsing issues
  let update;
  try {
    update = await c.req.json();
  } catch (e) {
    return c.text('Bad Request', 400);
  }

  // Initialize Bot if not already done (or just create fresh instance per request for simplicity in CF)
  // Creating fresh is safer for stateless environments like Workers
  const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

  // --- Register Handlers ---
  
  // Global Error Handler
  bot.catch(async (err) => {
    console.error('Global Bot Error:', err);
    // Optional: Send error message to admin chat here
  });

  // Commands
  bot.command('start', handleStart);
  bot.command('help', handleHelp);
  bot.command('link', handleLink);
  bot.command('unlink', handleUnlink);
  bot.command('sendvc', handleSendVC);
  bot.command('claim', handleClaim);
  bot.command('redeem', handleClaim); // Alias
  bot.command('status', handleStatus);
  bot.command('cancel', handleCancel);
  bot.command('clear', handleClear);

  // Text Handler for Verification Codes (Non-command replies)
  bot.on('message:text', async (ctx) => {
    // If it's a command, skip (commands are handled above by priority)
    // However, Grammy routes commands first. This listener catches non-commands.
    
    // Check if it's a reply to a pending VC
    const handled = await handlePendingCodeReply(ctx);
    if (handled) {
      return;
    }
    
    // Ignore other text messages silently
  });

  // --- Process Update ---
  
  // Use bot.handleUpdate which returns a Promise<void>
  // It automatically handles the Telegram API responses internally
  try {
    await bot.handleUpdate(update);
  } catch (error: any) {
    console.error('Error processing update:', error);
    // Return 200 OK anyway to prevent Telegram from retrying indefinitely on bad data
  }

  // Always return 200 OK to acknowledge receipt
  return c.text('OK', 200);
});

export default app;
