import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getUserFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET /api/quiz/wrong-questions
// 获取当前用户的错题列表
export async function GET(request: NextRequest) {
  try {
    const authUser = await getUserFromRequest(request);
    if (!authUser) {
      return NextResponse.json({ questions: [] });
    }
    const userId = authUser.sub;

    const supabase = createServiceClient();

    // 查询所有答错的记录，关联题目信息
    const { data, error } = await supabase
      .from('user_progress')
      .select(`
        id,
        question_id,
        user_answer,
        is_correct,
        created_at,
        questions!inner (
          id,
          question_number,
          domain,
          question_text,
          options,
          correct_answer,
          base_explanation,
          keywords
        )
      `)
      .eq('user_id', userId)
      .eq('is_correct', false)
      .order('created_at', { ascending: false })
      .range(0, 999);

    if (error) {
      console.error('Wrong questions query error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 按 question_id 分组，合并多次错误
    const grouped: Record<string, any> = {};
    for (const item of (data || [])) {
      const qId = item.question_id;
      if (!grouped[qId]) {
        grouped[qId] = {
          id: item.id,
          question: item.questions,
          user_answer: item.user_answer,
          attempt_count: 1,
          last_attempt_at: item.created_at,
          is_mastered: false,
        };
      } else {
        grouped[qId].attempt_count += 1;
        // 保留最新的答案
        if (new Date(item.created_at) > new Date(grouped[qId].last_attempt_at)) {
          grouped[qId].user_answer = item.user_answer;
          grouped[qId].last_attempt_at = item.created_at;
        }
      }
    }

    // 检查是否已掌握（最近一次答对了）
    const questionIds = Object.keys(grouped);
    if (questionIds.length > 0) {
      // 查询这些题目的所有正确记录
      const { data: correctData } = await supabase
        .from('user_progress')
        .select('question_id, created_at')
        .eq('user_id', userId)
        .eq('is_correct', true)
        .in('question_id', questionIds)
        .order('created_at', { ascending: false });

      if (correctData) {
        for (const correct of correctData) {
          const qId = correct.question_id;
          if (grouped[qId]) {
            // 如果最近一次正确的时间晚于最近一次错误的时间，标记为已掌握
            if (new Date(correct.created_at) > new Date(grouped[qId].last_attempt_at)) {
              grouped[qId].is_mastered = true;
            }
          }
        }
      }
    }

    const questions = Object.values(grouped);

    return NextResponse.json({ questions });
  } catch (error: any) {
    console.error('Wrong questions API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
