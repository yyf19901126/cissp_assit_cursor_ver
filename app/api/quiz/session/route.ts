import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// POST /api/quiz/session
// 创建考试/练习会话
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      user_id,
      mode = 'practice',
      question_count = 25,
      domain,
      time_limit,
    } = body;

    const supabase = createServiceClient();

    // 获取题目
    let query = supabase.from('questions').select('id');
    if (domain) {
      query = query.eq('domain', domain);
    }

    const { data: allQuestions, error } = await query;

    if (error || !allQuestions || allQuestions.length === 0) {
      return NextResponse.json({ error: '没有可用的题目' }, { status: 404 });
    }

    // 随机选取指定数量的题目
    const shuffled = allQuestions.sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, Math.min(question_count, shuffled.length));
    const questionIds = selected.map((q: any) => q.id);

    // 创建会话
    const sessionData: any = {
      mode,
      total_questions: questionIds.length,
      current_index: 0,
      question_ids: questionIds,
      answers: {},
      time_limit: mode === 'exam' ? (time_limit || 180) : null,
    };

    if (user_id) {
      sessionData.user_id = user_id;
    }

    const { data: session, error: sessionError } = await supabase
      .from('exam_sessions')
      .insert(sessionData)
      .select()
      .single();

    if (sessionError) {
      return NextResponse.json({ error: sessionError.message }, { status: 500 });
    }

    return NextResponse.json({ session });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
