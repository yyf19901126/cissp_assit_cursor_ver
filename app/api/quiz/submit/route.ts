import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getUserFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// POST /api/quiz/submit
// 提交答案 — 始终记录做题进度
export async function POST(request: NextRequest) {
  try {
    const authUser = await getUserFromRequest(request);
    if (!authUser) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await request.json();
    const { question_id, user_answer, time_spent, mode } = body;

    if (!question_id || !user_answer) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // 获取正确答案
    const { data: question, error: qError } = await supabase
      .from('questions')
      .select('correct_answer, base_explanation, keywords')
      .eq('id', question_id)
      .single();

    if (qError || !question) {
      return NextResponse.json({ error: '题目不存在' }, { status: 404 });
    }

    const isCorrect = user_answer.toUpperCase() === question.correct_answer.toUpperCase();

    // 记录做题进度
    try {
      const { error: insertError } = await supabase.from('user_progress').insert({
        user_id: authUser.sub,
        question_id,
        user_answer: user_answer.toUpperCase(),
        is_correct: isCorrect,
        time_spent: time_spent || 0,
        mode: mode || 'practice',
      });

      if (insertError) {
        console.error('Progress insert error:', insertError);
      }
    } catch (err) {
      console.error('Progress insert exception:', err);
    }

    return NextResponse.json({
      is_correct: isCorrect,
      correct_answer: question.correct_answer,
      explanation: question.base_explanation,
      keywords: question.keywords,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
