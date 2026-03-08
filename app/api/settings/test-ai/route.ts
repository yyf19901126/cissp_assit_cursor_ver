import { NextRequest, NextResponse } from 'next/server';
import { createAIClient, getModelName, DynamicAIConfig } from '@/lib/openai';

export const dynamic = 'force-dynamic';

// POST /api/settings/test-ai
// 测试 AI 连接是否可用
// Body: { ai_config: { api_key, base_url, model } }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const aiConfig: DynamicAIConfig | undefined = body.ai_config;

    if (!aiConfig?.api_key) {
      return NextResponse.json({ error: '请提供 API Key' }, { status: 400 });
    }

    const openai = createAIClient(aiConfig);
    const model = getModelName(aiConfig);

    // 发送一个简单的测试请求
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'user', content: 'Reply with exactly: OK' },
      ],
      max_completion_tokens: 10,
      temperature: 0,
    });

    const content = response.choices[0]?.message?.content || '';

    return NextResponse.json({
      success: true,
      model_used: model,
      response: content.trim(),
      message: `AI 连接成功！模型 ${model} 可正常使用。`,
    });
  } catch (error: any) {
    console.error('AI Test Error:', error);

    let errorMessage = error.message || '未知错误';
    if (error.status === 401) {
      errorMessage = 'API Key 无效或已过期，请检查你的 Key';
    } else if (error.status === 404) {
      errorMessage = '模型不存在，请检查模型名称或 Base URL';
    } else if (error.status === 429) {
      errorMessage = 'API 调用频率超限，请稍后重试';
    } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      errorMessage = '无法连接到 AI 服务，请检查 Base URL';
    }

    return NextResponse.json({
      success: false,
      error: errorMessage,
    }, { status: 400 });
  }
}
