-- Supabase 数据库表结构初始化脚本
-- 在 Supabase Dashboard -> SQL Editor -> New Query 中执行

-- 1. 用户表
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. 用户积分表
CREATE TABLE IF NOT EXISTS user_credits (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  total_credits INTEGER NOT NULL DEFAULT 0,
  used_credits INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. 生成历史表
CREATE TABLE IF NOT EXISTS generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  prompt TEXT NOT NULL,
  model_id TEXT NOT NULL,
  model_name TEXT NOT NULL,
  dimensions TEXT NOT NULL,
  image_size TEXT NOT NULL DEFAULT '',
  image_path TEXT NOT NULL,
  credits_used INTEGER NOT NULL DEFAULT 0,
  reference_images TEXT NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 上游图片接口请求日志：成功和失败均记录，供管理员排查路由和报错。
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
  error_detail TEXT NOT NULL DEFAULT '',
  reference_image_types TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. 用户保存的图片表
CREATE TABLE IF NOT EXISTS images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  model_name TEXT NOT NULL,
  dimensions TEXT NOT NULL,
  image_size TEXT NOT NULL DEFAULT '',
  image_path TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('favorite', 'backup', 'discarded')),
  reference_images TEXT NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. 邀请码表
CREATE TABLE IF NOT EXISTS invite_codes (
  code TEXT PRIMARY KEY,
  credits INTEGER NOT NULL,
  issued_credits INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  redeemed_by TEXT,
  redeemed_at TIMESTAMPTZ,
  low_balance_since TIMESTAMPTZ
);

-- 6. 应用设置表
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 创建索引优化查询
CREATE INDEX IF NOT EXISTS idx_generations_user_id ON generations(user_id);
CREATE INDEX IF NOT EXISTS idx_generations_created_at ON generations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generation_requests_created_at ON generation_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_images_user_id ON images(user_id);
CREATE INDEX IF NOT EXISTS idx_images_category ON images(user_id, category);
CREATE INDEX IF NOT EXISTS idx_invite_codes_redeemed ON invite_codes(redeemed_by);

-- 创建 updated_at 自动更新触发器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_user_credits_updated_at ON user_credits;
CREATE TRIGGER update_user_credits_updated_at
  BEFORE UPDATE ON user_credits
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_app_settings_updated_at ON app_settings;
CREATE TRIGGER update_app_settings_updated_at
  BEFORE UPDATE ON app_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 启用 RLS (Row Level Security) 并创建策略
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE generation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE images ENABLE ROW LEVEL SECURITY;
ALTER TABLE invite_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- 创建策略：用户只能访问自己的数据
CREATE POLICY "Users can view own data" ON users
  FOR SELECT USING (true);

CREATE POLICY "Users can view own credits" ON user_credits
  FOR SELECT USING (true);

CREATE POLICY "Users can view own generations" ON generations
  FOR SELECT USING (true);

CREATE POLICY "Users can view own images" ON images
  FOR SELECT USING (true);

CREATE POLICY "Users can view invite codes" ON invite_codes
  FOR SELECT USING (true);

-- 插入默认管理员账号（密码: admin123，记得部署后修改）
-- 使用 bcrypt hash: $2a$10$YourHashHere
-- 实际使用时请替换为正确的 bcrypt hash

-- 插入初始设置
INSERT INTO app_settings (key, value, updated_at)
VALUES ('schema_version', '1', NOW())
ON CONFLICT (key) DO NOTHING;

-- 查看创建的表
SELECT 'Tables created successfully!' as status;
