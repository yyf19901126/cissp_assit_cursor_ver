-- 一次性术语增强回填：审计字段
-- 在 Supabase SQL Editor 执行

ALTER TABLE knowledge_terms
  ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS enriched_model TEXT,
  ADD COLUMN IF NOT EXISTS enriched_version INTEGER;

CREATE INDEX IF NOT EXISTS idx_knowledge_terms_enriched_at
  ON knowledge_terms(enriched_at DESC);

CREATE INDEX IF NOT EXISTS idx_knowledge_terms_enriched_version
  ON knowledge_terms(enriched_version);
