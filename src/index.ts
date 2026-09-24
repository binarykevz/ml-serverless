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

  const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

  bot.catch(async (err) => {
    console.error('Global Bot Error:', err);
  });

  // Wrap handlers to inject env
  const wrapHandler = (handler: Function) => {
    return async (ctx: any) => {
      // Inject env into context
      ctx.env = env;
      await handler(ctx);
    };
  };

  bot.command('start', wrapHandler(handleStart));
  bot.command('help', wrapHandler(handleHelp));
  bot.command('link', wrapHandler(handleLink));
  bot.command('unlink', wrapHandler(handleUnlink));
  bot.command('sendvc', wrapHandler(handleSendVC));
  bot.command('claim', wrapHandler(handleClaim));
  bot.command('redeem', wrapHandler(handleClaim));
  bot.command('status', wrapHandler(handleStatus));
  bot.command('cancel', wrapHandler(handleCancel));
  bot.command('clear', wrapHandler(handleClear));

  bot.on('message:text', async (ctx: any) => {
    if (ctx.message?.text?.startsWith('/')) {
      return;
    }
    ctx.env = env;
    const handled = await handlePendingCodeReply(ctx);
    if (handled) {
      return;
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
