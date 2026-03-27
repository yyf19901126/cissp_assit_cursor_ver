import { NextRequest, NextResponse } from 'next/server';
import { createAIClient, getModelName, DynamicAIConfig } from '@/lib/openai';
import { getUserFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// POST /api/ai/repair-question
// 管理员：根据 OCR 常见错误修正题干与选项措辞（不预设题库答案正确）
export async function POST(request: NextRequest) {
  try {
    const authUser = await getUserFromRequest(request);
    if (!authUser || authUser.role !== 'admin') {
      return NextResponse.json({ error: '需要管理员权限' }, { status: 403 });
    }

    const body = await request.json();
    const {
      question_text,
      options,
      domain_id,
      ai_config,
    } = body as {
      question_text?: string;
      options?: Array<{ label: string; text: string }>;
      domain_id?: number;
      ai_config?: DynamicAIConfig;
    };

    if (!question_text || typeof question_text !== 'string') {
      return NextResponse.json({ error: '缺少 question_text' }, { status: 400 });
    }
    if (!options || !Array.isArray(options)) {
      return NextResponse.json({ error: '缺少 options' }, { status: 400 });
    }

    const optionsText = options
      .map((o) => `${String(o.label).toUpperCase()}. ${o.text ?? ''}`)
      .join('\n');

    const openai = createAIClient(ai_config);
    const model = getModelName(ai_config);

    const systemPrompt = `你是 OCR 后处理与题库校对助手。用户内容来自 PDF/OCR，常有缺空格、字母错、重复字符、断词等问题。
规则：
1) 只修正明显的 OCR/排版错误，尽量保持原意与选项字母 A-D 不变。
2) 不要改写为另一道不同的题；不要擅自更换正确选项。
3) 不要输出任何解释，只输出 JSON。
4) 语言保持与输入一致（通常为英文题干+选项）。
5) options 数组必须恰好 4 条，label 分别为 A、B、C、D（大写）。

JSON 格式：
{
  "question_text": "修正后的题干",
  "options": [
    { "label": "A", "text": "..." },
    { "label": "B", "text": "..." },
    { "label": "C", "text": "..." },
    { "label": "D", "text": "..." }
  ]
}`;

    const userPrompt = `以下为题干与选项，请按规则修正 OCR 问题：

题干：
${question_text}

选项：
${optionsText}

${domain_id ? `（题库标注域 Domain ${domain_id}，仅供参考）` : ''}`;

    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      max_completion_tokens: 2000,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content || '{}';
    let parsed: any = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      return NextResponse.json({ error: 'AI 返回非 JSON' }, { status: 502 });
    }

    return NextResponse.json({
      question_text: parsed.question_text,
      options: parsed.options,
      model_used: model,
    });
  } catch (error: any) {
    console.error('repair-question error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
