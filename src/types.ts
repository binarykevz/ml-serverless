export interface Env {
  DB: D1Database;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  VC_EXHAUSTED_CODES?: string; // Comma separated codes e.g., "-20029"
  VC_EXHAUSTED_TEXT?: string;  // Comma separated texts e.g., "验证码次数用尽"
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

// API Response Structures
export interface MobaPayResponse {
  data?: any;
  success?: boolean;
}

export interface MLApiResponse {
  code?: string | number;
  status?: string;
  msg?: string;
  message?: string;
}
