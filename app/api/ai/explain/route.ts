import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { createAIClient, getModelName, DynamicAIConfig } from '@/lib/openai';

export const dynamic = 'force-dynamic';

// POST /api/ai/explain
// AI 深度解析题目
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

    const systemPrompt = `You are a CISSP Master Instructor and exam preparation expert. 
Your role is to provide deep, insightful analysis of CISSP exam questions.

IMPORTANT GUIDELINES:
1. Always think from a MANAGEMENT perspective, not a technical one
2. Highlight critical keywords ("题眼") in the question that determine the correct answer
3. Map the question to the specific CISSP CBK domain and sub-topic
4. Reference official study materials (like OSG 9th Edition) when possible
5. Explain WHY each wrong option is wrong
6. Respond in Chinese (简体中文) for the analysis

Return your analysis as a JSON object with this structure:
{
  "deep_analysis": "深度解析...",
  "domain_mapping": {
    "domain_id": 1-8,
    "domain_name": "English domain name",
    "sub_topic": "具体子知识点"
  },
  "cbk_reference": "CBK/OSG 参考内容...",
  "manager_perspective": "如果你是管理层，为什么选这个？从风险管理和业务角度分析...",
  "key_highlights": ["MOST", "FIRST", ...题眼关键词],
  "correct_reasoning": "正确答案的推理过程",
  "wrong_reasoning": "用户错误选项的分析（为什么看起来对但实际上错）"
}`;

    const userPrompt = `请深度分析以下 CISSP 题目：

题目：${question.question_text}

选项：
${optionsText}

正确答案：${question.correct_answer}
${user_answer ? `用户选择：${user_answer}` : ''}
${question.base_explanation ? `原始解析：${question.base_explanation}` : ''}

请提供：
1. 深度解析
2. 所属 CISSP 域和子知识点
3. CBK/OSG 教材参考
4. 管理思维视角分析（如果你是管理层，为什么选这个？）
5. 题眼高亮（如 MOST, LEAST, FIRST, PRIMARY 等关键限定词）
6. 正确答案推理
7. 错误选项分析`;

    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content || '{}';
    const explanation = JSON.parse(content);

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
