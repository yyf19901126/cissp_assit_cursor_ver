import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// POST /api/quiz/submit
// 提交答案
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { user_id, question_id, user_answer, time_spent, mode, session_id } = body;

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

    // 记录答题
    if (user_id) {
      await supabase.from('user_progress').insert({
        user_id,
        question_id,
        user_answer: user_answer.toUpperCase(),
        is_correct: isCorrect,
        time_spent: time_spent || 0,
        mode: mode || 'practice',
      });
    }

    // 更新考试会话
    if (session_id) {
      const { data: session } = await supabase
        .from('exam_sessions')
        .select('*')
        .eq('id', session_id)
        .single();

      if (session) {
        const newAnswers = { ...session.answers, [question_id]: user_answer.toUpperCase() };
        await supabase
          .from('exam_sessions')
          .update({
            current_index: session.current_index + 1,
            answers: newAnswers,
          })
          .eq('id', session_id);
      }
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
