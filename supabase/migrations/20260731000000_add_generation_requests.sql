CREATE TABLE IF NOT EXISTS generation_requests (
  id BIGINT PRIMARY KEY,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  prompt TEXT NOT NULL DEFAULT '',
  model_id TEXT NOT NULL,
  model_name TEXT NOT NULL,
  dimensions TEXT NOT NULL DEFAULT '',
  image_size TEXT NOT NULL DEFAULT '',
  image_path TEXT NOT NULL DEFAULT '',
  credits_used INTEGER NOT NULL DEFAULT 0,
  api_request_ms INTEGER NOT NULL DEFAULT 0,
  reference_images TEXT NOT NULL DEFAULT '[]',
  result_status TEXT NOT NULL,
  result_message TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_generation_requests_created_at
  ON generation_requests(created_at DESC);

ALTER TABLE generation_requests ENABLE ROW LEVEL SECURITY;
