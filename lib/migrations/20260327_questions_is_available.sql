-- 题目可用性：标记为 false 的题目不出现在任何练习模式中，但仍保留在库中便于审计与恢复。
-- 在 Supabase SQL Editor 中执行一次即可。

ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS is_available BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_questions_is_available ON questions (is_available);

COMMENT ON COLUMN questions.is_available IS 'false = 已从练习中隐藏，不计入可用题量';
