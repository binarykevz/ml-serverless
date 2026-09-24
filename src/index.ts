import { Hono } from 'hono';
import type { Env, Update } from './types';
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

  let update: Update;
  try {
    update = await c.req.json();
  } catch (e) {
    return c.text('Bad Request', 400);
  }

  const msg = update.message;
  if (!msg || !msg.text) {
    return c.text('OK', 200);
  }

  const text = msg.text.trim();
  const isCommand = text.startsWith('/');

  if (!isCommand) {
    const handled = await handlePendingCodeReply(env, msg);
    if (handled) {
      return c.text('OK', 200);
    }
    return c.text('OK', 200);
  }

  const cmd = text.split(/\s+/)[0].split('@')[0].toLowerCase();
  
  try {
    switch (cmd) {
      case '/start':
      case '/help':
        await handleStart(env, msg);
        break;
      case '/link':
        await handleLink(env, msg);
        break;
      case '/unlink':
        await handleUnlink(env, msg);
        break;
      case '/sendvc':
        await handleSendVC(env, msg);
        break;
      case '/claim':
      case '/redeem':
        await handleClaim(env, msg);
        break;
      case '/status':
        await handleStatus(env, msg);
        break;
      case '/cancel':
        await handleCancel(env, msg);
        break;
      case '/clear':
        await handleClear(env, msg);
        break;
      default:
         // Unknown command ignored
    }
  } catch (error: any) {
    console.error('Handler Error:', error);
  }

  return c.text('OK', 200);
});

export default app;
