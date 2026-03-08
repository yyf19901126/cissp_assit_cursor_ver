import { NextRequest, NextResponse } from 'next/server';
import { createAIClient, getModelName, DynamicAIConfig } from '@/lib/openai';

export const dynamic = 'force-dynamic';

// POST /api/import/parse
// 使用 AI 将原始题目文本解析为结构化 JSON
// Body: {
//   ai_config: { api_key, base_url, model },
//   raw_questions: [{ index, rawText }],   // 有识别结果时
//   raw_text: string,                      // 无法识别格式时，传入原文
//   batch_index: number
// }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ai_config, raw_questions, raw_text, batch_index = 0 } = body;

    if (!ai_config?.api_key) {
      return NextResponse.json({ error: '请先配置并验证 AI API Key' }, { status: 400 });
    }

    const aiConfigTyped: DynamicAIConfig = ai_config;
    const openai = createAIClient(aiConfigTyped);
    const model = getModelName(aiConfigTyped);

    let contentToAnalyze: string;

    if (raw_questions && raw_questions.length > 0) {
      // 已预拆分的题目
      contentToAnalyze = raw_questions
        .map((q: any) => `--- Question ${q.index} ---\n${q.rawText}`)
        .join('\n\n');
    } else if (raw_text) {
      // 未能识别格式，让 AI 整体解析
      contentToAnalyze = raw_text;
    } else {
      return NextResponse.json({ error: '没有题目内容可解析' }, { status: 400 });
    }

    const systemPrompt = `You are a CISSP exam question parser. Your job is to extract structured question data from raw text, regardless of the formatting.

For each question you find, extract:
1. question_number: Sequential number
2. domain: The CISSP domain (1-8):
   - 1: Security and Risk Management
   - 2: Asset Security
   - 3: Security Architecture and Engineering
   - 4: Communication and Network Security
   - 5: Identity and Access Management (IAM)
   - 6: Security Assessment and Testing
   - 7: Security Operations
   - 8: Software Development Security
3. question_text: The question stem (clean text)
4. options: Array of {label: "A"/"B"/"C"/"D", text: "option text"}
5. correct_answer: The correct option letter (A, B, C, or D). If not explicitly provided, use your CISSP expertise to determine the correct answer.
6. base_explanation: The explanation for the correct answer. If not in the original text, provide your own expert explanation.
7. keywords: Array of critical terms ("题眼") like MOST, LEAST, FIRST, PRIMARY, BEST, NOT, EXCEPT, INITIAL

IMPORTANT:
- Handle ANY text format - the questions might not follow a standard pattern
- Extract ALL questions you can find
- If options don't have explicit labels, assign A/B/C/D
- Always determine the correct domain based on question content
- Return a JSON object with a "questions" key containing an array

Return format: { "questions": [...] }`;

    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Parse the following CISSP questions into structured JSON:\n\n${contentToAnalyze}`,
        },
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content || '{}';
    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      return NextResponse.json({
        error: 'AI 返回了无效的 JSON 格式',
        raw_response: content.substring(0, 500),
      }, { status: 500 });
    }

    const questions = Array.isArray(parsed)
      ? parsed
      : parsed.questions || parsed.data || [];

    return NextResponse.json({
      questions,
      batch_index,
      count: questions.length,
      model_used: model,
    });
  } catch (error: any) {
    console.error('Import Parse Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
