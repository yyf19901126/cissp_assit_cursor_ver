-- CISSP 知识库：术语来源 + 术语主表
-- 在 Supabase SQL Editor 执行一次

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

CREATE TABLE IF NOT EXISTS knowledge_terms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  term_name TEXT NOT NULL,
  term_key TEXT NOT NULL UNIQUE, -- lower(trim(term_name))
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
CREATE INDEX IF NOT EXISTS idx_knowledge_terms_term_name ON knowledge_terms(term_name);

ALTER TABLE knowledge_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_terms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Knowledge sources are viewable by everyone" ON knowledge_sources;
CREATE POLICY "Knowledge sources are viewable by everyone" ON knowledge_sources
  FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "Knowledge terms are viewable by everyone" ON knowledge_terms;
CREATE POLICY "Knowledge terms are viewable by everyone" ON knowledge_terms
  FOR SELECT USING (TRUE);
