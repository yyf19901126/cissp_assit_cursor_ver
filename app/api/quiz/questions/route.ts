import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// POST /api/quiz/questions
// 根据 question_ids 批量获取题目详情
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { question_ids } = body;

    if (!question_ids || !Array.isArray(question_ids) || question_ids.length === 0) {
      return NextResponse.json({ error: '请提供题目 ID 列表' }, { status: 400 });
    }

    const supabase = createServiceClient();

    const { data: questions, error } = await supabase
      .from('questions')
      .select('*')
      .in('id', question_ids)
      .eq('is_available', true);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 保持与 question_ids 相同的顺序
    const orderedQuestions = question_ids
      .map((id: string) => (questions || []).find((q: any) => q.id === id))
      .filter(Boolean);

    return NextResponse.json({ questions: orderedQuestions });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
