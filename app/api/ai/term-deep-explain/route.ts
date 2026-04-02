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

// POST /api/ai/term-deep-explain
// 基于术语详情生成 CISSP 管理视角的较详细解释
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
    const confusionPoints = String(body.confusion_points || '').trim();
    const aiConfig = body.ai_config as DynamicAIConfig | undefined;

    if (!termName) {
      return NextResponse.json({ error: 'term_name 不能为空' }, { status: 400 });
    }

    const openai = createAIClient(aiConfig);
    const model = getModelName(aiConfig);

    const systemPrompt = `你是 CISSP 导师。请对给定术语做“管理视角”的详细说明（中文）。
要求：
1) 避免定义复读，强调 ISC² 的管理决策逻辑（治理、职责、风险、优先级）；
2) 说明考试里常见误区和排除思路；
3) 回答结构化为 JSON，字段：
{
  "manager_view": "2-4句，管理者视角",
  "decision_focus": ["要点1","要点2","要点3"],
  "exam_traps": ["误区1","误区2"],
  "quick_compare": "与易混术语的一句区分"
}`;

    const userPayload = {
      term_name: termName,
      official_definition: officialDefinition,
      concept_logic: conceptLogic,
      confusion_points: confusionPoints,
    };

    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify(userPayload) },
      ],
      temperature: 0.2,
      max_completion_tokens: 900,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content || '{}';
    const parsed = parseJsonSafe(content);
    if (!parsed) {
      return NextResponse.json(
        {
          result: {
            manager_view: content,
            decision_focus: [],
            exam_traps: [],
            quick_compare: '',
          },
          model_used: model,
        },
        { status: 200 }
      );
    }

    return NextResponse.json({ result: parsed, model_used: model });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
