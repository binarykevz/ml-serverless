import type { Env, Update } from './types';
import { 
  handleStart, 
  handleLink, 
  handleSendVC, 
  handleClaim, 
  handleStatus, 
  handleCancel, 
  handleClear,
  handleGetInfo,
  handlePendingCodeReply 
} from './lib/handlers';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    // Verify Secret Token if provided
    const secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
    if (env.TELEGRAM_WEBHOOK_SECRET && secret !== env.TELEGRAM_WEBHOOK_SECRET) {
      return new Response('Unauthorized', { status: 401 });
    }

    let update: Update;
    try {
      update = await request.json();
    } catch (e) {
      return new Response('Bad Request', { status: 400 });
    }

    const msg = update.message;
    if (!msg || !msg.text) {
      return new Response('OK', { status: 200 });
    }

    const text = msg.text.trim();
    const isCommand = text.startsWith('/');

    // 1. Handle Non-Command Replies (Verification Codes)
    if (!isCommand) {
      // Pass env and msg to handler
      const handled = await handlePendingCodeReply(env, msg);
      if (handled) {
        return new Response('OK', { status: 200 });
      }
      // If not handled, ignore silently (could be random chat)
      return new Response('OK', { status: 200 });
    }

    // 2. Handle Commands
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
        case '/sendvc':
          await handleSendVC(env, msg);
          break;
          case '/getinfo':
          await handleGetInfo(env, msg);
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
          await new Response('Unknown Command', { status: 200 }); // Or send message back
          // Ideally send message back here using sendMessage helper
      }
    } catch (error: any) {
      console.error('Handler Error:', error);
      // Optional: Notify user of error
    }

    return new Response('OK', { status: 200 });
  },
};
