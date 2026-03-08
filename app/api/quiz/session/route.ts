import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import crypto from 'crypto';

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

    // 获取题目（突破默认 1000 行限制）
    let query = supabase.from('questions').select('id').range(0, 9999);
    if (domain) {
      query = query.eq('domain', domain);
    }

    const { data: allQuestions, error } = await query;

    if (error) {
      console.error('Session query error:', error);
      return NextResponse.json({ error: `查询题目失败: ${error.message}` }, { status: 500 });
    }

    if (!allQuestions || allQuestions.length === 0) {
      return NextResponse.json({ error: '没有可用的题目，请先导入题库' }, { status: 404 });
    }

    // 随机选取指定数量的题目
    const shuffled = [...allQuestions].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, Math.min(question_count, shuffled.length));
    const questionIds = selected.map((q: any) => q.id);

    // 如果有 user_id，尝试写入 exam_sessions 表
    if (user_id) {
      const sessionData = {
        user_id,
        mode,
        total_questions: questionIds.length,
        current_index: 0,
        question_ids: questionIds,
        answers: {},
        time_limit: mode === 'exam' ? (time_limit || 180) : null,
      };

      const { data: session, error: sessionError } = await supabase
        .from('exam_sessions')
        .insert(sessionData)
        .select()
        .single();

      if (sessionError) {
        console.error('Session insert error:', sessionError);
        // 即使写入失败，也返回虚拟会话让用户能答题
      } else {
        return NextResponse.json({ session });
      }
    }

    // 无 user_id 或写入失败时，返回虚拟会话（不持久化到数据库）
    const virtualSession = {
      id: crypto.randomUUID(),
      mode,
      total_questions: questionIds.length,
      current_index: 0,
      question_ids: questionIds,
      answers: {},
      time_limit: mode === 'exam' ? (time_limit || 180) : null,
      start_time: new Date().toISOString(),
      is_virtual: true, // 标记为虚拟会话
    };

    return NextResponse.json({ session: virtualSession });
  } catch (error: any) {
    console.error('Session API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
