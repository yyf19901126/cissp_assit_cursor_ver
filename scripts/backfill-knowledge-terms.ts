import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

type TermRow = {
  id: string;
  term_name: string;
  term_key: string;
  official_definition: string;
  domain_number: number;
  concept_logic: string | null;
  aka_synonyms: string[] | null;
  process_step: string | null;
  confusion_points: string | null;
  is_new_topic: boolean | null;
};

type EnrichedItem = {
  term_key: string;
  concept_logic: string;
  aka_synonyms: string[];
  process_step: string;
  confusion_points: string;
  is_new_topic: boolean;
};

const FETCH_PAGE_SIZE = 500;
const AI_BATCH_SIZE = Number(process.env.KNOWLEDGE_BACKFILL_BATCH || 20);
const RETRY_TIMES = 3;
const MIN_CONCEPT_LEN = 50;
const MIN_CONFUSION_LEN = 40;

function parseArg(name: string): string | undefined {
  const prefix = `${name}=`;
  const hit = process.argv.find((x) => x.startsWith(prefix));
  return hit?.slice(prefix.length);
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function isWeakText(value: string | null | undefined, minLen: number): boolean {
  const t = String(value || '').trim();
  if (!t) return true;
  if (t.length < minLen) return true;
  if (/^(n\/a|none|null|unknown|-|待补充)$/i.test(t)) return true;
  return false;
}

function normalizeSynonyms(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const uniq = new Set<string>();
  for (const x of input) {
    const t = String(x || '').trim();
    if (!t) continue;
    if (t.length > 80) continue;
    uniq.add(t);
  }
  return [...uniq].slice(0, 8);
}

function parseJsonLenient(content: string): any {
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

function chooseBetterText(oldValue: string, newValue: string, minLen: number): string {
  const oldText = oldValue.trim();
  const nextText = newValue.trim();
  if (!nextText) return oldText;
  if (isWeakText(oldText, minLen) && !isWeakText(nextText, minLen)) return nextText;
  if (isWeakText(oldText, minLen) && nextText.length > oldText.length) return nextText;
  if (!isWeakText(oldText, minLen) && nextText.length > oldText.length + 30) return nextText;
  return oldText;
}

function needsEnrichment(row: TermRow): boolean {
  const conceptWeak = isWeakText(row.concept_logic, MIN_CONCEPT_LEN);
  const confusionWeak = isWeakText(row.confusion_points, MIN_CONFUSION_LEN);
  const noSynonyms = !Array.isArray(row.aka_synonyms) || row.aka_synonyms.length === 0;
  const noStep = !String(row.process_step || '').trim();
  return conceptWeak || confusionWeak || noSynonyms || noStep;
}

async function enrichBatch(
  openai: OpenAI,
  model: string,
  rows: TermRow[]
): Promise<Map<string, EnrichedItem>> {
  const result = new Map<string, EnrichedItem>();
  if (rows.length === 0) return result;

  const payload = rows.map((r) => ({
    term_name: r.term_name,
    term_key: r.term_key,
    official_definition: r.official_definition,
    domain_number: r.domain_number,
    current: {
      concept_logic: String(r.concept_logic || ''),
      aka_synonyms: normalizeSynonyms(r.aka_synonyms),
      process_step: String(r.process_step || ''),
      confusion_points: String(r.confusion_points || ''),
      is_new_topic: Boolean(r.is_new_topic),
    },
  }));

  const systemPrompt = `你是 ISC² CISSP 管理思维教练。你需要补空字段并修复低质量字段，输出严格 JSON。
输出格式：
{"items":[{"term_key":"","concept_logic":"","aka_synonyms":[],"process_step":"","confusion_points":"","is_new_topic":false}]}

规则：
1) 每条都必须返回上述 6 个字段；
2) concept_logic 必须是“管理者决策逻辑”，不要复述术语定义；用中文，建议 2-3 句，优先采用“优先级：... 逻辑：...”结构；
3) concept_logic 必须体现 ISC² 视角：先治理/风险/职责，再技术实现；把“Doer 实现思维”拉回“Advisor/Manager 决策思维”；
4) aka_synonyms：尽可能给 1-5 个；确实没有才返回 [];
5) process_step：若不属于流程可返回空字符串；
6) confusion_points：指出易混概念并给一句区分，强调考试中最容易误选的点；
7) is_new_topic：仅在合理把握下 true，否则 false；
8) 禁止使用空话（如“需要综合考虑”）；要给可执行判断标准（先做什么、谁负责、为什么）；
9) 如果术语属于运营/治理类，强调 policy、ownership、accountability、risk decision；
10) 如果术语属于技术类，也必须落到管理决策层含义（何时采用、风险权衡、控制目标），而非配置细节；
11) 只返回 JSON，不要额外文字。`;

  for (let attempt = 1; attempt <= RETRY_TIMES; attempt += 1) {
    try {
      const resp = await openai.chat.completions.create({
        model,
        temperature: 0.2,
        max_completion_tokens: 3000,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify({ items: payload }) },
        ],
      });

      const content = resp.choices[0]?.message?.content || '{}';
      const parsed = parseJsonLenient(content);
      const items = Array.isArray(parsed.items)
        ? parsed.items
        : Array.isArray(parsed.data)
          ? parsed.data
          : Array.isArray(parsed.terms)
            ? parsed.terms
            : [];

      if (items.length === 0) {
        const topKeys =
          parsed && typeof parsed === 'object' ? Object.keys(parsed).slice(0, 10) : [];
        console.warn(
          `AI 返回可解析 JSON 但未找到 items/data/terms。topKeys=${topKeys.join(',') || 'none'}`
        );
      }

      for (const item of items) {
        const key = String(
          item.term_key || item.termKey || item.key || (item.term_name ? item.term_name : '')
        )
          .trim()
          .toLowerCase()
          .replace(/\s+/g, ' ');
        if (!key) continue;
        result.set(key, {
          term_key: key,
          concept_logic: String(item.concept_logic || item.conceptLogic || '').trim(),
          aka_synonyms: normalizeSynonyms(item.aka_synonyms || item.akaSynonyms),
          process_step: String(item.process_step || item.processStep || '').trim(),
          confusion_points: String(item.confusion_points || item.confusionPoints || '').trim(),
          is_new_topic: Boolean(item.is_new_topic ?? item.isNewTopic),
        });
      }
      return result;
    } catch (err: any) {
      const lastTry = attempt === RETRY_TIMES;
      console.warn(
        `AI 批次失败（attempt ${attempt}/${RETRY_TIMES}）: ${err.message || err}`
      );
      if (lastTry) return result;
      const waitMs = attempt * 1500;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  return result;
}

async function main() {
  loadEnvLocal();

  const dryRun = hasFlag('--dry-run');
  const limit = Number(parseArg('--limit') || 0);
  const enrichVersion = Number(parseArg('--version') || 1);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const openaiBase = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const model = process.env.OPENAI_MODEL || 'gpt-4o';

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('缺少 Supabase 环境变量：NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  }
  if (!openaiKey) {
    throw new Error('缺少 OPENAI_API_KEY');
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const openai = new OpenAI({ apiKey: openaiKey, baseURL: openaiBase });

  console.log('='.repeat(60));
  console.log('知识库术语回填启动');
  console.log(`model=${model} dryRun=${dryRun} batch=${AI_BATCH_SIZE} version=${enrichVersion}`);
  console.log('='.repeat(60));

  const allRows: TermRow[] = [];
  let page = 0;
  while (true) {
    const from = page * FETCH_PAGE_SIZE;
    const to = from + FETCH_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from('knowledge_terms')
      .select(
        'id,term_name,term_key,official_definition,domain_number,concept_logic,aka_synonyms,process_step,confusion_points,is_new_topic'
      )
      .order('term_key', { ascending: true })
      .range(from, to);
    if (error) throw new Error(`拉取术语失败: ${error.message}`);
    if (!data || data.length === 0) break;
    allRows.push(...(data as TermRow[]));
    page += 1;
    if (data.length < FETCH_PAGE_SIZE) break;
  }

  let candidates = allRows.filter(needsEnrichment);
  if (limit > 0) candidates = candidates.slice(0, limit);

  console.log(`术语总数: ${allRows.length}`);
  console.log(`待补全/修复: ${candidates.length}`);
  if (candidates.length === 0) {
    console.log('无需处理，结束。');
    return;
  }

  let processed = 0;
  let updated = 0;
  let failed = 0;

  for (let i = 0; i < candidates.length; i += AI_BATCH_SIZE) {
    const batch = candidates.slice(i, i + AI_BATCH_SIZE);
    const map = await enrichBatch(openai, model, batch);
    const now = new Date().toISOString();

    for (const row of batch) {
      processed += 1;
      const ai = map.get(row.term_key);
      if (!ai) {
        failed += 1;
        continue;
      }

      const oldConcept = String(row.concept_logic || '').trim();
      const oldConfusion = String(row.confusion_points || '').trim();
      const oldStep = String(row.process_step || '').trim();
      const oldSyn = normalizeSynonyms(row.aka_synonyms);
      const oldIsNew = Boolean(row.is_new_topic);

      const nextConcept = chooseBetterText(oldConcept, ai.concept_logic, MIN_CONCEPT_LEN);
      const nextConfusion = chooseBetterText(oldConfusion, ai.confusion_points, MIN_CONFUSION_LEN);
      const nextStep = oldStep || ai.process_step || '';
      const nextSynonyms =
        oldSyn.length >= 2 ? oldSyn : ai.aka_synonyms.length > 0 ? ai.aka_synonyms : oldSyn;
      const nextIsNew = oldIsNew || ai.is_new_topic;

      const changed =
        nextConcept !== oldConcept ||
        nextConfusion !== oldConfusion ||
        nextStep !== oldStep ||
        JSON.stringify(nextSynonyms) !== JSON.stringify(oldSyn) ||
        nextIsNew !== oldIsNew;

      if (!changed) continue;
      updated += 1;

      if (!dryRun) {
        const patch = {
          concept_logic: nextConcept,
          confusion_points: nextConfusion,
          process_step: nextStep,
          aka_synonyms: nextSynonyms,
          is_new_topic: nextIsNew,
          enriched_at: now,
          enriched_model: model,
          enriched_version: enrichVersion,
          updated_at: now,
        };
        const { error } = await supabase.from('knowledge_terms').update(patch).eq('id', row.id);
        if (error) {
          failed += 1;
          console.error(`更新失败 ${row.term_key}: ${error.message}`);
        }
      }
    }

    console.log(
      `进度 ${Math.min(i + AI_BATCH_SIZE, candidates.length)}/${candidates.length} | processed=${processed} updated=${updated} failed=${failed}`
    );
  }

  console.log('='.repeat(60));
  console.log(`完成: processed=${processed}, updated=${updated}, failed=${failed}, dryRun=${dryRun}`);
  console.log('='.repeat(60));
}

main().catch((err) => {
  console.error('执行失败:', err.message || err);
  process.exit(1);
});
