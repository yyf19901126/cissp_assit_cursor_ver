import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getUserFromRequest } from '@/lib/auth';
import { createAIClient, getModelName, DynamicAIConfig } from '@/lib/openai';

export const dynamic = 'force-dynamic';

type RawEntry = {
  term_name: string;
  official_definition: string;
  domain_number?: number;
};

type Enriched = {
  term_key: string;
  concept_logic: string;
  aka_synonyms: string[];
  process_step: string;
  confusion_points: string;
  is_new_topic: boolean;
};

const ENRICH_VERSION = 1;

function toTermKey(term: string) {
  return term.trim().toLowerCase().replace(/\s+/g, ' ');
}

function parseJsonLenient(content: string) {
  const raw = String(content || '').trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenced?.[1]) {
      try {
        return JSON.parse(fenced[1]);
      } catch {
        // noop
      }
    }
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch {
        // noop
      }
    }
    return {};
  }
}

async function enrichWithAI(
  entries: RawEntry[],
  aiConfig?: DynamicAIConfig
): Promise<Map<string, Enriched>> {
  const result = new Map<string, Enriched>();
  if (!aiConfig?.api_key) return result;

  const openai = createAIClient(aiConfig);
  const model = getModelName(aiConfig);

  const input = entries.map((e) => ({
    term_name: e.term_name,
    term_key: toTermKey(e.term_name),
    official_definition: e.official_definition,
    domain_number: e.domain_number || 1,
  }));

  const systemPrompt = `你是 ISC² CISSP 管理思维教练。根据给定术语与官方定义，生成学习字段。
要求：
1) 输出 JSON：{"items":[...]}
2) 每个 item 必须包含：term_key, concept_logic, aka_synonyms, process_step, confusion_points, is_new_topic
3) concept_logic 必须是“管理者决策逻辑”，不要复述定义；用中文，建议 2-3 句，优先采用“优先级：... 逻辑：...”结构
4) concept_logic 要体现 ISC² 视角：先治理/风险/职责，再技术实现；将 Doer 思维拉向 Advisor/Manager 思维
5) aka_synonyms 最多 5 个；没有就返回 []
6) process_step 若无流程语义返回空字符串
7) confusion_points 要指出易混概念与考试误选点
8) is_new_topic 仅当你有合理把握时设为 true，否则 false
9) 只输出 JSON，不要任何额外文字`;

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: JSON.stringify({ items: input }) },
    ],
    temperature: 0.2,
    max_completion_tokens: 2000,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content || '{}';
  const parsed: any = parseJsonLenient(content);
  const items = Array.isArray(parsed.items)
    ? parsed.items
    : Array.isArray(parsed.data)
      ? parsed.data
      : Array.isArray(parsed.terms)
        ? parsed.terms
        : [];
  for (const it of items) {
    const key = String(
      it.term_key || it.termKey || it.key || (it.term_name ? it.term_name : '')
    )
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
    if (!key) continue;
    result.set(key, {
      term_key: key,
      concept_logic: String(it.concept_logic || it.conceptLogic || ''),
      aka_synonyms: Array.isArray(it.aka_synonyms || it.akaSynonyms)
        ? (it.aka_synonyms || it.akaSynonyms).map((x: any) => String(x)).slice(0, 8)
        : [],
      process_step: String(it.process_step || it.processStep || ''),
      confusion_points: String(it.confusion_points || it.confusionPoints || ''),
      is_new_topic: Boolean(it.is_new_topic ?? it.isNewTopic),
    });
  }
  return result;
}

// POST /api/knowledge/import-chunk
// 管理员导入术语分块（增量 upsert）
export async function POST(request: NextRequest) {
  try {
    const authUser = await getUserFromRequest(request);
    if (!authUser || authUser.role !== 'admin') {
      return NextResponse.json({ error: '仅管理员可导入知识库' }, { status: 403 });
    }

    const body = await request.json();
    const { source_id, entries, ai_config } = body as {
      source_id: string;
      entries: RawEntry[];
      ai_config?: DynamicAIConfig;
    };

    if (!source_id || !Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json({ error: '缺少 source_id 或 entries' }, { status: 400 });
    }

    const normalized = entries
      .map((e) => ({
        term_name: String(e.term_name || '').trim(),
        official_definition: String(e.official_definition || '').trim(),
        domain_number: Number(e.domain_number || 1),
      }))
      .filter((e) => e.term_name && e.official_definition)
      .map((e) => ({
        ...e,
        domain_number:
          e.domain_number >= 1 && e.domain_number <= 8 ? e.domain_number : 1,
      }));

    if (normalized.length === 0) {
      return NextResponse.json({ error: '无有效术语可导入' }, { status: 400 });
    }

    const enriched = await enrichWithAI(normalized, ai_config);
    const enrichModel =
      ai_config?.model?.trim() || process.env.OPENAI_MODEL || 'gpt-4o';

    const rows = normalized.map((e) => {
      const term_key = toTermKey(e.term_name);
      const ai = enriched.get(term_key);
      return {
        term_name: e.term_name,
        term_key,
        official_definition: e.official_definition,
        domain_number: e.domain_number,
        concept_logic: ai?.concept_logic || '',
        aka_synonyms: ai?.aka_synonyms || [],
        process_step: ai?.process_step || '',
        confusion_points: ai?.confusion_points || '',
        is_new_topic: ai?.is_new_topic || false,
        enriched_at: ai ? new Date().toISOString() : null,
        enriched_model: ai ? enrichModel : null,
        enriched_version: ai ? ENRICH_VERSION : null,
        source_id,
        updated_by: authUser.sub,
      };
    });

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('knowledge_terms')
      .upsert(rows, { onConflict: 'term_key' })
      .select('id');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      processed: normalized.length,
      saved: data?.length || 0,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
