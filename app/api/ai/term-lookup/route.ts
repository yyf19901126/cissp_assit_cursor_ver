import { NextRequest, NextResponse } from 'next/server';
import { createAIClient, getModelName, DynamicAIConfig } from '@/lib/openai';
import { createServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// POST /api/ai/term-lookup
// 名词速查 — 查询安全领域术语的中文解释
// Body: { term: string, ai_config?: { api_key, base_url, model } }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { term, ai_config } = body;

    if (!term || term.trim().length === 0) {
      return NextResponse.json({ error: '请输入要查询的术语' }, { status: 400 });
    }

    // 优先查本地知识库，命中则直接返回，减少 API 调用时延
    const supabase = createServiceClient();
    const keyword = term.trim();
    const { data: kbRows } = await supabase
      .from('knowledge_terms')
      .select('*')
      .or(`term_name.ilike.%${keyword}%,official_definition.ilike.%${keyword}%`)
      .limit(1);

    if (kbRows && kbRows.length > 0) {
      const row: any = kbRows[0];
      return NextResponse.json({
        result: {
          term_original: keyword,
          term_chinese: row.term_name,
          full_name: Array.isArray(row.aka_synonyms) ? row.aka_synonyms.join(', ') : '',
          explanation: row.official_definition,
          security_role: row.concept_logic || '',
          related_domain: row.domain_number ? String(row.domain_number) : '',
        },
        model_used: 'knowledge_base',
      });
    }

    const aiConfigTyped: DynamicAIConfig | undefined = ai_config;
    const openai = createAIClient(aiConfigTyped);
    const model = getModelName(aiConfigTyped);

    const systemPrompt = `你是一位 CISSP 信息安全领域的专家词典。用户会输入一个信息安全/IT 领域的英文或中文术语，你需要：

1. 给出该术语的准确中文翻译（如果是英文）
2. 用通俗易懂的中文解释这个概念是什么
3. 说明它在信息安全领域中的作用和重要性
4. 如果是缩写，展开全称

**重要规则：**
- 绝对不要给出任何考试题目的答案或暗示
- 只做知识性解释，不要出题或评价
- 回答简洁精炼，控制在 200 字以内
- 使用中文回答

请以 JSON 格式返回：
{
  "term_original": "用户输入的原始术语",
  "term_chinese": "中文名称/翻译",
  "full_name": "如果是缩写，给出全称；否则为空",
  "explanation": "通俗解释",
  "security_role": "在信息安全中的作用",
  "related_domain": "相关的 CISSP 域（1-8）"
}`;

    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `请解释术语：${term.trim()}` },
      ],
      temperature: 0.2,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content || '{}';
    let result: any;
    try {
      result = JSON.parse(content);
    } catch {
      result = {
        term_original: term,
        term_chinese: '',
        full_name: '',
        explanation: content,
        security_role: '',
        related_domain: '',
      };
    }

    return NextResponse.json({ result, model_used: model });
  } catch (error: any) {
    console.error('Term Lookup Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
