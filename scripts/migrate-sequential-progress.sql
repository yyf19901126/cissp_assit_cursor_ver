-- ============================================
-- 顺序刷题进度表迁移脚本
-- 在 Supabase SQL Editor 中执行
-- ============================================

-- 创建顺序刷题进度表
CREATE TABLE IF NOT EXISTS sequential_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_question_number INTEGER NOT NULL, -- 最后完成的题号
  total_questions INTEGER NOT NULL,      -- 题库总题数
  answered_count INTEGER DEFAULT 0,      -- 已答题数
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id) -- 每个用户只有一条进度记录
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_sequential_progress_user ON sequential_progress(user_id);

-- 启用 RLS
ALTER TABLE sequential_progress ENABLE ROW LEVEL SECURITY;

-- 注意：RLS 策略不需要设置，因为所有操作都通过 service_role API 路由完成
