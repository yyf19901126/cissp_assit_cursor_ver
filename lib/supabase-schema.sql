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

-- 2. 用户答题记录表
CREATE TABLE IF NOT EXISTS user_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  user_answer VARCHAR(1) NOT NULL,
  is_correct BOOLEAN NOT NULL,
  time_spent INTEGER DEFAULT 0, -- 秒
  mode VARCHAR(10) DEFAULT 'practice' CHECK (mode IN ('practice', 'exam')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 错题本视图
CREATE OR REPLACE VIEW wrong_questions AS
SELECT
  up.id,
  up.user_id,
  up.question_id,
  up.user_answer,
  q.question_number,
  q.domain,
  q.question_text,
  q.options,
  q.correct_answer,
  q.base_explanation,
  q.keywords,
  COUNT(*) AS attempt_count,
  MAX(up.created_at) AS last_attempt_at,
  -- 如果最近一次答对了则视为已掌握
  BOOL_OR(up.is_correct ORDER BY up.created_at DESC) AS is_mastered
FROM user_progress up
JOIN questions q ON q.id = up.question_id
WHERE up.is_correct = FALSE
GROUP BY up.id, up.user_id, up.question_id, up.user_answer,
         q.question_number, q.domain, q.question_text, q.options,
         q.correct_answer, q.base_explanation, q.keywords;

-- 4. 考试会话表
CREATE TABLE IF NOT EXISTS exam_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
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
ALTER TABLE user_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own progress" ON user_progress
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own progress" ON user_progress
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own sessions" ON exam_sessions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own sessions" ON exam_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own sessions" ON exam_sessions
  FOR UPDATE USING (auth.uid() = user_id);

-- questions 表对所有人可读
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Questions are viewable by everyone" ON questions
  FOR SELECT USING (true);
