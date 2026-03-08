-- ============================================
-- CISSP Study Assistant - Supabase 数据库 Schema
-- ============================================

-- 1. 题库表
CREATE TABLE IF NOT EXISTS questions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  question_number INTEGER NOT NULL UNIQUE,
  domain SMALLINT NOT NULL CHECK (domain BETWEEN 1 AND 8),
  question_text TEXT NOT NULL,
  options JSONB NOT NULL, -- [{label: "A", text: "..."}, ...]
  correct_answer VARCHAR(1) NOT NULL CHECK (correct_answer IN ('A','B','C','D')),
  base_explanation TEXT DEFAULT '',
  keywords TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 用户答题记录表（user_id 不绑定 auth.users，支持匿名用户）
CREATE TABLE IF NOT EXISTS user_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  user_answer VARCHAR(1) NOT NULL,
  is_correct BOOLEAN NOT NULL,
  time_spent INTEGER DEFAULT 0, -- 秒
  mode VARCHAR(10) DEFAULT 'practice' CHECK (mode IN ('practice', 'exam')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 考试会话表（user_id 不绑定 auth.users，支持匿名用户）
CREATE TABLE IF NOT EXISTS exam_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  mode VARCHAR(10) DEFAULT 'practice' CHECK (mode IN ('practice', 'exam')),
  total_questions INTEGER NOT NULL,
  current_index INTEGER DEFAULT 0,
  question_ids UUID[] NOT NULL,
  answers JSONB DEFAULT '{}',
  start_time TIMESTAMPTZ DEFAULT NOW(),
  end_time TIMESTAMPTZ,
  time_limit INTEGER, -- 分钟
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引优化
CREATE INDEX IF NOT EXISTS idx_questions_domain ON questions(domain);
CREATE INDEX IF NOT EXISTS idx_user_progress_user ON user_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_user_progress_question ON user_progress(question_id);
CREATE INDEX IF NOT EXISTS idx_exam_sessions_user ON exam_sessions(user_id);

-- RLS (行级安全) 策略
-- 使用 service_role key 的 API 路由自动绕过 RLS
-- 以下策略确保安全性：仅允许 service_role 操作
ALTER TABLE user_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_sessions ENABLE ROW LEVEL SECURITY;

-- questions 表对所有人可读
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Questions are viewable by everyone" ON questions
  FOR SELECT USING (true);

-- user_progress 和 exam_sessions 不需要前端直接访问
-- 所有操作通过 API 路由（service_role）完成，RLS 启用但无 anon 策略即可阻止前端直连

-- ============================================
-- 迁移脚本（已有数据库必须执行！）
-- 在 Supabase SQL Editor 中运行以下 SQL
-- ============================================
-- 1. 移除外键约束（支持匿名用户 UUID）
-- ALTER TABLE user_progress DROP CONSTRAINT IF EXISTS user_progress_user_id_fkey;
-- ALTER TABLE exam_sessions DROP CONSTRAINT IF EXISTS exam_sessions_user_id_fkey;
--
-- 2. 删除旧的 RLS 策略（如果存在）
-- DROP POLICY IF EXISTS "Users can view own progress" ON user_progress;
-- DROP POLICY IF EXISTS "Users can insert own progress" ON user_progress;
-- DROP POLICY IF EXISTS "Users can view own sessions" ON exam_sessions;
-- DROP POLICY IF EXISTS "Users can insert own sessions" ON exam_sessions;
-- DROP POLICY IF EXISTS "Users can update own sessions" ON exam_sessions;
--
-- 3. 删除旧的错题本视图（如果存在）
-- DROP VIEW IF EXISTS wrong_questions;
