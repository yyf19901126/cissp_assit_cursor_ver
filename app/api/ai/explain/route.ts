import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { createAIClient, getModelName, DynamicAIConfig } from '@/lib/openai';

export const dynamic = 'force-dynamic';

// POST /api/ai/explain
// AI 精简解析题目（独立判断，不依赖题库答案）
// Body: { question_id, user_answer, ai_config?: { api_key, base_url, model } }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { question_id, user_answer, ai_config } = body;

    if (!question_id) {
      return NextResponse.json({ error: '缺少 question_id' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // 获取题目信息
    const { data: question, error } = await supabase
      .from('questions')
      .select('*')
      .eq('id', question_id)
      .single();

    if (error || !question) {
      return NextResponse.json({ error: '题目不存在' }, { status: 404 });
    }

    // 使用动态 AI 配置或环境变量
    const aiConfigTyped: DynamicAIConfig | undefined = ai_config;
    const openai = createAIClient(aiConfigTyped);
    const model = getModelName(aiConfigTyped);

    // 构建选项文本
    const optionsText = question.options
      .map((opt: any) => `${opt.label}. ${opt.text}`)
      .join('\n');

    const systemPrompt = `你是 CISSP 题目讲解助手。请严格遵守：
1) 必须独立判断正确选项，只能根据题干与选项推理。
2) 不得把题库提供的答案当作前提或事实（即使题库答案可能存在）。
3) 输出务必简短，避免长篇大论；目标是快速讲清楚。
4) 语言必须是简体中文。
5) 只返回 JSON，不要返回额外文本。

JSON 结构如下：
{
  "ai_answer": "A/B/C/D",
  "quick_takeaway": "1-2句结论（<=70字）",
  "option_briefs": [
    { "option": "A", "verdict": "correct|incorrect", "reason": "一句话说明（<=40字）" }
  ],
  "cissp_knowledge_point": "对应知识点（域 + 子主题，<=40字）",
  "domain_mapping": {
    "domain_id": 1-8,
    "domain_name": "English domain name",
    "sub_topic": "具体子知识点"
  },
  "key_highlights": ["MOST", "FIRST"]
}`;

    const userPrompt = `请精简解析以下 CISSP 题目：

题目：${question.question_text}

选项：
${optionsText}

${user_answer ? `用户选择：${user_answer}` : ''}
${question.domain ? `题库标注域（仅供参考，不代表正确推理）：Domain ${question.domain}` : ''}

请输出：
1. AI 独立判断的正确选项（ai_answer）
2. 一句总结（quick_takeaway）
3. 每个选项一句话：为什么对/不对（option_briefs）
4. 对应 CISSP 知识点（cissp_knowledge_point）
5. 域映射 + 题眼关键词`;

    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1,
      max_completion_tokens: 500,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content || '{}';
    let explanation: any = {};
    try {
      explanation = JSON.parse(content);
    } catch {
      explanation = {};
    }

    // 兜底：确保前端能稳定渲染
    if (!explanation || typeof explanation !== 'object') {
      explanation = {};
    }
    if (!Array.isArray(explanation.option_briefs)) {
      explanation.option_briefs = [];
    }
    if (!Array.isArray(explanation.key_highlights)) {
      explanation.key_highlights = [];
    }

    return NextResponse.json({
      explanation,
      question,
      model_used: model,
    });
  } catch (error: any) {
    console.error('AI Explain Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
