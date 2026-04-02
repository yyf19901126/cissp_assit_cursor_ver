-- 知识点复习：PDF元数据 + 题库知识点标签
-- 在 Supabase SQL Editor 执行

ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS knowledge_tags TEXT[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_questions_knowledge_tags
  ON questions USING GIN (knowledge_tags);

CREATE TABLE IF NOT EXISTS knowledge_review_pdfs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL UNIQUE,
  file_size BIGINT NOT NULL DEFAULT 0,
  mime_type TEXT NOT NULL DEFAULT 'application/pdf',
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_review_pdfs_uploaded_at
  ON knowledge_review_pdfs(uploaded_at DESC);

ALTER TABLE knowledge_review_pdfs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Knowledge review pdfs are viewable by everyone" ON knowledge_review_pdfs;
CREATE POLICY "Knowledge review pdfs are viewable by everyone" ON knowledge_review_pdfs
  FOR SELECT USING (TRUE);
