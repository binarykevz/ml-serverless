// src/index.ts
import { Hono } from 'hono';
import { Bot } from 'grammy';
import type { Env, MyContext } from './types';
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

  let update;
  try {
    update = await c.req.json();
  } catch (e) {
    return c.text('Bad Request', 400);
  }

  // Initialize Bot
  const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

  // Register Handlers
  bot.catch(async (err) => {
    console.error('Global Bot Error:', err);
  });

  bot.command('start', handleStart);
  bot.command('help', handleHelp);
  bot.command('link', handleLink);
  bot.command('unlink', handleUnlink);
  bot.command('sendvc', handleSendVC);
  bot.command('claim', handleClaim);
  bot.command('redeem', handleClaim);
  bot.command('status', handleStatus);
  bot.command('cancel', handleCancel);
  bot.command('clear', handleClear);

  bot.on('message:text', async (ctx) => {
    if (ctx.message?.text?.startsWith('/')) {
      return;
    }
    const handled = await handlePendingCodeReply(ctx as MyContext);
    if (handled) {
      return;
    }
  });

  // Process Update with Environment Injection
  // Grammy allows passing additional context properties via the second argument of handleUpdate
  try {
    await bot.handleUpdate(update, { env });
  } catch (error: any) {
    console.error('Error processing update:', error);
  }

  return c.text('OK', 200);
});

export default app;
