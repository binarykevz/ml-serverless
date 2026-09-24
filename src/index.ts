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

app.post('/', async (c) => {
  const env = c.env;
  
  // Verify Secret Token
  const secret = c.req.header('X-Telegram-Bot-Api-Secret-Token');
  if (env.TELEGRAM_WEBHOOK_SECRET && secret !== env.TELEGRAM_WEBHOOK_SECRET) {
    return c.text('Unauthorized', 401);
  }

  // Initialize Bot with Environment Variables
  const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

  // Global Middleware: Handle Errors
  bot.catch(async (err) => {
    console.error('Global Bot Error:', err);
    // Optionally notify admin or user
  });

  // Command Routing
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
    // If it's a command, skip (commands are handled above)
    if (ctx.message?.text?.startsWith('/')) {
      return;
    }
    
    // Check if it's a reply to a pending VC
    const handled = await handlePendingCodeReply(ctx);
    if (handled) {
      return;
    }
    
    // Ignore other text messages silently
  });

  // Process the update using Grammy's webhook callback
  // This converts the Hono Request into a Grammy Update and runs the bot logic
  const response = await bot.webhookCallback(c.req.raw, {
    secretToken: env.TELEGRAM_WEBHOOK_SECRET,
  });

  return response;
});

export default app;
