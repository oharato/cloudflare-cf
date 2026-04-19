-- D1 マイグレーション: todos テーブル作成
-- voice_data BLOB は R2 に移行済みのため voice_r2_key で参照
CREATE TABLE IF NOT EXISTS todos (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT    NOT NULL,
  completed    INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  voice_status TEXT    NOT NULL DEFAULT 'pending',
  voice_r2_key TEXT
);
