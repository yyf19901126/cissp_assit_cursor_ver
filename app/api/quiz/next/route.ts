import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// GET /api/quiz/next
// 获取下一道题目（智能避开已掌握题目）
// 查询参数:
//   - user_id: 用户 ID
//   - domain: 可选，指定域 (1-8)
//   - mode: practice | exam
//   - session_id: 可选，考试会话 ID
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');
    const domain = searchParams.get('domain');
    const mode = searchParams.get('mode') || 'practice';
    const sessionId = searchParams.get('session_id');

    const supabase = createServiceClient();

    // 如果有考试会话，从会话中获取下一题
    if (sessionId) {
      const { data: session, error: sessionError } = await supabase
        .from('exam_sessions')
        .select('*')
        .eq('id', sessionId)
        .single();

      if (sessionError || !session) {
        return NextResponse.json({ error: '会话不存在' }, { status: 404 });
      }

      if (session.current_index >= session.question_ids.length) {
        return NextResponse.json({ completed: true, session });
      }

      const currentQuestionId = session.question_ids[session.current_index];
      const { data: question } = await supabase
        .from('questions')
        .select('*')
        .eq('id', currentQuestionId)
        .single();

      return NextResponse.json({
        question,
        currentIndex: session.current_index,
        totalQuestions: session.total_questions,
        session,
      });
    }

    // 练习模式：智能选题
    // 1. 获取用户已经答对的题目 ID
    let masteredIds: string[] = [];
    if (userId) {
      const { data: masteredData } = await supabase
        .from('user_progress')
        .select('question_id')
        .eq('user_id', userId)
        .eq('is_correct', true);

      masteredIds = (masteredData || []).map((d: any) => d.question_id);
    }

    // 2. 构建查询（突破 1000 行限制）
    let query = supabase.from('questions').select('*').range(0, 9999);

    // 按域筛选
    if (domain) {
      query = query.eq('domain', parseInt(domain));
    }

    // 排除已掌握
    if (masteredIds.length > 0) {
      query = query.not('id', 'in', `(${masteredIds.join(',')})`);
    }

    // 随机取一道
    const { data: questions, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!questions || questions.length === 0) {
      return NextResponse.json({
        completed: true,
        message: '所有题目已掌握！',
      });
    }

    // 随机选一道
    const randomIndex = Math.floor(Math.random() * questions.length);
    const question = questions[randomIndex];

    return NextResponse.json({
      question,
      remaining: questions.length,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
