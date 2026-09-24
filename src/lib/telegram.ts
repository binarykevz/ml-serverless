import type { Env } from '../types';

const TG_API_BASE = 'https://api.telegram.org/bot';

export async function sendMessage(
  env: Env,
  chatId: number | string,
  text: string,
  options: Record<string, any> = {}
) {
  const url = `${TG_API_BASE}${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
      ...options,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Telegram Send Error:', errorText);
    throw new Error(`Failed to send message: ${errorText}`);
  }

  return response.json();
}

export async function sendChatAction(
  env: Env,
  chatId: number | string,
  action: string = 'typing'
) {
  const url = `${TG_API_BASE}${env.TELEGRAM_BOT_TOKEN}/sendChatAction`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        action,
      }),
    });
  } catch (e) {
    // Ignore errors for typing indicators to prevent crash
    console.warn('Send Chat Action failed:', e);
  }
}

export async function deleteMessage(
  env: Env,
  chatId: number | string,
  messageId: number
) {
  const url = `${TG_API_BASE}${env.TELEGRAM_BOT_TOKEN}/deleteMessage`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
      }),
    });
  } catch (e) {
    console.warn('Delete Message failed:', e);
  }
}

export function escapeMarkdown(text: string): string {
  if (!text) return '';
  return String(text).replace(/[_*`[\]]/g, '\\$&');
}
