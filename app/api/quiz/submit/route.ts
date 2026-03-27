import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getUserFromRequest, COOKIE_NAME } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// POST /api/quiz/submit
// 提交答案 — 每做完1道题立即记录进度（所有模式通用）
export async function POST(request: NextRequest) {
  try {
    // ═══════════════ 认证检查 ═══════════════
    const cookieValue = request.cookies.get(COOKIE_NAME)?.value;
    const authUser = await getUserFromRequest(request);

    if (!authUser) {
      console.error('[Submit] Auth failed - cookie present:', !!cookieValue, 'cookie length:', cookieValue?.length || 0);
      return NextResponse.json({
        error: '未登录',
        debug: { hasCookie: !!cookieValue },
      }, { status: 401 });
    }
    console.log('[Submit API] userId from token:', authUser.sub);

    const body = await request.json();
    const { question_id, user_answer, time_spent, mode } = body;

    if (!question_id || !user_answer) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // ═══════════════ 获取正确答案 ═══════════════
    const { data: question, error: qError } = await supabase
      .from('questions')
      .select('correct_answer, base_explanation, keywords, is_available')
      .eq('id', question_id)
      .single();

    if (qError || !question) {
      console.error('[Submit] Question not found:', question_id, qError);
      return NextResponse.json({ error: '题目不存在' }, { status: 404 });
    }

    if (question.is_available === false) {
      return NextResponse.json({ error: '该题已停用，无法提交答案' }, { status: 410 });
    }

    const isCorrect = user_answer.toUpperCase() === question.correct_answer.toUpperCase();
    const modeValue = mode || 'practice';

    // ═══════════════ 记录做题进度 ═══════════════
    // 直接插入记录，简单可靠
    const { data: inserted, error: insertError } = await supabase
      .from('user_progress')
      .insert({
        user_id: authUser.sub,
        question_id,
        user_answer: user_answer.toUpperCase(),
        is_correct: isCorrect,
        time_spent: time_spent || 0,
        mode: modeValue,
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('[Submit] Insert failed:', {
        code: insertError.code,
        message: insertError.message,
        hint: insertError.hint,
        details: insertError.details,
        user_id: authUser.sub,
        question_id,
      });
      // 即使保存失败，仍返回答题结果，但附带警告
      return NextResponse.json({
        is_correct: isCorrect,
        correct_answer: question.correct_answer,
        explanation: question.base_explanation,
        keywords: question.keywords,
        save_error: insertError.message,
      });
    }

    console.log('[Submit] OK - user:', authUser.username, 'question:', question_id.slice(0, 8), 'correct:', isCorrect, 'record:', inserted.id.slice(0, 8));

    return NextResponse.json({
      is_correct: isCorrect,
      correct_answer: question.correct_answer,
      explanation: question.base_explanation,
      keywords: question.keywords,
    });
  } catch (error: any) {
    console.error('[Submit] Exception:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
