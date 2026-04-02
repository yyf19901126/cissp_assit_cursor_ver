import { NextRequest, NextResponse } from 'next/server';
import { createAIClient, getModelName, DynamicAIConfig } from '@/lib/openai';
import { getUserFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function parseJsonSafe(content: string) {
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

// POST /api/ai/generate-term-questions
// 基于术语生成 1-5 道拟真 CISSP 题
export async function POST(request: NextRequest) {
  try {
    const authUser = await getUserFromRequest(request);
    if (!authUser) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const body = await request.json();
    const termName = String(body.term_name || '').trim();
    const officialDefinition = String(body.official_definition || '').trim();
    const conceptLogic = String(body.concept_logic || '').trim();
    const count = Math.min(5, Math.max(1, Number(body.count || 3)));
    const aiConfig = body.ai_config as DynamicAIConfig | undefined;

    if (!termName) {
      return NextResponse.json({ error: 'term_name 不能为空' }, { status: 400 });
    }

    const openai = createAIClient(aiConfig);
    const model = getModelName(aiConfig);

    const systemPrompt = `你是 CISSP 出题教练。请围绕给定术语生成拟真单选题。
要求：
1) 生成 ${count} 题，每题四个选项 A/B/C/D；
2) 风格贴近 CISSP：强调管理视角、风险优先级、职责边界；
3) 每题返回正确答案与简短解析；
4) 输出 JSON：
{
  "items":[
    {
      "question":"...",
      "options":[{"label":"A","text":"..."},{"label":"B","text":"..."},{"label":"C","text":"..."},{"label":"D","text":"..."}],
      "correct_answer":"A",
      "explanation":"..."
    }
  ]
}`;

    const payload = {
      term_name: termName,
      official_definition: officialDefinition,
      concept_logic: conceptLogic,
    };

    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify(payload) },
      ],
      temperature: 0.4,
      max_completion_tokens: 2400,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content || '{}';
    const parsed = parseJsonSafe(content);
    if (!parsed) {
      return NextResponse.json({ error: 'AI 返回内容解析失败' }, { status: 500 });
    }

    const items = Array.isArray(parsed.items) ? parsed.items : [];
    return NextResponse.json({ items, model_used: model });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
