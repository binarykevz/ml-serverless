// src/types.ts
import { Context as GrammyContext } from 'grammy';

export interface Env {
  TELEGRAM_BOT_TOKEN: string;
  TURSO_DATABASE_URL: string;
  TURSO_AUTH_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  VC_EXHAUSTED_CODES?: string;
  VC_EXHAUSTED_TEXT?: string;
}

// Custom Context that extends Grammy's Context with our Env
export interface MyContext extends GrammyContext {
  env: Env;
}

export interface TelegramUser {
  id: number;
  username?: string;
  first_name?: string;
}

export interface TelegramChat {
  id: number;
  type: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  text?: string;
  caption?: string;
  reply_to_message?: TelegramMessage;
}

export interface Update {
  update_id: number;
  message?: TelegramMessage;
}

export interface IgnResult {
  success: boolean;
  name?: string;
  error?: string;
}
