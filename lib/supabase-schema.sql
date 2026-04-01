-- ============================================
-- CISSP Study Assistant - Supabase 数据库 Schema
-- ============================================

-- 0. 用户表（自建用户系统，不依赖 Supabase Auth）
CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(10) DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  -- AI 配置（每用户独立）
  ai_api_key TEXT DEFAULT '',
  ai_base_url TEXT DEFAULT 'https://api.openai.com/v1',
  ai_model TEXT DEFAULT 'gpt-4o',
  ai_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1. 题库表（所有用户共享）
CREATE TABLE IF NOT EXISTS questions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  question_number INTEGER NOT NULL UNIQUE,
  domain SMALLINT NOT NULL CHECK (domain BETWEEN 1 AND 8),
  question_text TEXT NOT NULL,
  options JSONB NOT NULL, -- [{label: "A", text: "..."}, ...]
  correct_answer VARCHAR(1) NOT NULL CHECK (correct_answer IN ('A','B','C','D')),
  base_explanation TEXT DEFAULT '',
  keywords TEXT[] DEFAULT '{}',
  is_available BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 用户答题记录表（用户独立）
CREATE TABLE IF NOT EXISTS user_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  user_answer VARCHAR(1) NOT NULL,
  is_correct BOOLEAN NOT NULL,
  time_spent INTEGER DEFAULT 0, -- 秒
  mode VARCHAR(10) DEFAULT 'practice' CHECK (mode IN ('practice', 'exam')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 考试会话表（用户独立）
CREATE TABLE IF NOT EXISTS exam_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
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

-- 4. 顺序刷题进度表（用户独立，跨平台同步）
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

-- 索引优化
CREATE INDEX IF NOT EXISTS idx_questions_domain ON questions(domain);
CREATE INDEX IF NOT EXISTS idx_user_progress_user ON user_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_user_progress_question ON user_progress(question_id);
CREATE INDEX IF NOT EXISTS idx_exam_sessions_user ON exam_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sequential_progress_user ON sequential_progress(user_id);

-- 5. CISSP 知识库来源表
CREATE TABLE IF NOT EXISTS knowledge_sources (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source_name TEXT NOT NULL,
  source_version TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_sha256 TEXT NOT NULL UNIQUE,
  page_count INTEGER NOT NULL DEFAULT 0,
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. CISSP 知识库术语表
CREATE TABLE IF NOT EXISTS knowledge_terms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  term_name TEXT NOT NULL,
  term_key TEXT NOT NULL UNIQUE,
  official_definition TEXT NOT NULL,
  domain_number SMALLINT NOT NULL CHECK (domain_number BETWEEN 1 AND 8),
  concept_logic TEXT DEFAULT '',
  aka_synonyms TEXT[] DEFAULT '{}',
  process_step TEXT DEFAULT '',
  confusion_points TEXT DEFAULT '',
  is_new_topic BOOLEAN DEFAULT FALSE,
  mastery_level SMALLINT DEFAULT 0 CHECK (mastery_level BETWEEN 0 AND 5),
  source_id UUID REFERENCES knowledge_sources(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_knowledge_terms_domain ON knowledge_terms(domain_number);
CREATE INDEX IF NOT EXISTS idx_knowledge_terms_mastery ON knowledge_terms(mastery_level);
CREATE INDEX IF NOT EXISTS idx_knowledge_terms_new_topic ON knowledge_terms(is_new_topic);
CREATE INDEX IF NOT EXISTS idx_knowledge_terms_source ON knowledge_terms(source_id);

-- RLS (行级安全) — 所有操作通过 service_role API 路由完成
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequential_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_terms ENABLE ROW LEVEL SECURITY;

-- questions 表对所有人可读（包括 anon）
CREATE POLICY "Questions are viewable by everyone" ON questions
  FOR SELECT USING (true);

CREATE POLICY "Knowledge sources are viewable by everyone" ON knowledge_sources
  FOR SELECT USING (true);

CREATE POLICY "Knowledge terms are viewable by everyone" ON knowledge_terms
  FOR SELECT USING (true);

-- 其他表不设 anon 策略，仅 service_role 可访问

-- ============================================
-- 迁移脚本（从旧版本升级时执行）
-- 在 Supabase SQL Editor 中运行
-- ============================================
-- 1. 创建 users 表（如果不存在）
-- CREATE TABLE IF NOT EXISTS users (
--   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
--   username VARCHAR(50) NOT NULL UNIQUE,
--   password_hash TEXT NOT NULL,
--   role VARCHAR(10) DEFAULT 'user' CHECK (role IN ('admin', 'user')),
--   ai_api_key TEXT DEFAULT '',
--   ai_base_url TEXT DEFAULT 'https://api.openai.com/v1',
--   ai_model TEXT DEFAULT 'gpt-4o',
--   ai_verified BOOLEAN DEFAULT FALSE,
--   created_at TIMESTAMPTZ DEFAULT NOW()
-- );
-- ALTER TABLE users ENABLE ROW LEVEL SECURITY;
--
-- 2. 移除旧的 auth.users 外键约束
-- ALTER TABLE user_progress DROP CONSTRAINT IF EXISTS user_progress_user_id_fkey;
-- ALTER TABLE exam_sessions DROP CONSTRAINT IF EXISTS exam_sessions_user_id_fkey;
--
-- 3. 添加新的 users 表外键约束
-- ALTER TABLE user_progress ADD CONSTRAINT user_progress_user_id_fkey
--   FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
-- ALTER TABLE exam_sessions ADD CONSTRAINT exam_sessions_user_id_fkey
--   FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
--
-- 4. 删除旧的 RLS 策略
-- DROP POLICY IF EXISTS "Users can view own progress" ON user_progress;
-- DROP POLICY IF EXISTS "Users can insert own progress" ON user_progress;
-- DROP POLICY IF EXISTS "Users can view own sessions" ON exam_sessions;
-- DROP POLICY IF EXISTS "Users can insert own sessions" ON exam_sessions;
-- DROP POLICY IF EXISTS "Users can update own sessions" ON exam_sessions;
-- DROP POLICY IF EXISTS "Service role can manage all progress" ON user_progress;
-- DROP POLICY IF EXISTS "Service role can manage all sessions" ON exam_sessions;
--
-- 5. 清理旧的匿名用户数据（可选）
-- DELETE FROM user_progress WHERE user_id NOT IN (SELECT id FROM users);
-- DELETE FROM exam_sessions WHERE user_id NOT IN (SELECT id FROM users);
