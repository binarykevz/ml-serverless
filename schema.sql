-- Users Table
CREATE TABLE IF NOT EXISTS ml_users (
  telegram_id TEXT PRIMARY KEY,
  telegram_username TEXT,
  game_id TEXT,
  server_id TEXT,
  ign TEXT,
  verification_code TEXT,
  vc_status TEXT,
  vc_message TEXT,
  updated_at INTEGER NOT NULL
);

-- Claim Logs Table
CREATE TABLE IF NOT EXISTS claim_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id TEXT NOT NULL,
  telegram_username TEXT,
  game_id TEXT,
  server_id TEXT,
  ign TEXT,
  cdk TEXT,
  vcode TEXT,
  status TEXT,
  message TEXT,
  created_at INTEGER NOT NULL
);

-- Pending Verification Requests Table
CREATE TABLE IF NOT EXISTS pending_vc_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  game_id TEXT NOT NULL,
  server_id TEXT NOT NULL,
  ign TEXT,
  bot_message_id INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  source TEXT NOT NULL DEFAULT 'manual',
  code TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  completed_at INTEGER
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ml_users_game_server ON ml_users(game_id, server_id);
CREATE INDEX IF NOT EXISTS idx_claim_logs_telegram_id ON claim_logs(telegram_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pending_vc_telegram_status ON pending_vc_requests(telegram_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pending_vc_bot_message ON pending_vc_requests(bot_message_id);
