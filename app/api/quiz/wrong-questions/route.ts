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
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }
    const userId = authUser.sub;
    console.log('[WrongQ API] userId from token:', userId);

    const supabase = createServiceClient();

    // ═══════════════════ 获取错题数据（避免 join 在 Vercel 上的问题）═══════════════════
    // 1. 先查 user_progress 中的错题记录
    const { data: wrongRecords, error: progressError } = await supabase
      .from('user_progress')
      .select('id, question_id, user_answer, is_correct, created_at')
      .eq('user_id', userId)
      .eq('is_correct', false)
      .order('created_at', { ascending: false })
      .range(0, 999);

    if (progressError) {
      console.error('[WrongQ] Error fetching wrong records:', progressError);
      return NextResponse.json({ error: progressError.message }, { status: 500 });
    }

    if (!wrongRecords || wrongRecords.length === 0) {
      console.log('[WrongQ] No wrong records found');
      return NextResponse.json({ questions: [] });
    }

    // 2. 获取所有 question_id
    const questionIds = [...new Set(wrongRecords.map((r) => r.question_id))];

    // 3. 批量查询 questions 表
    const { data: questionsData, error: questionsError } = await supabase
      .from('questions')
      .select('id, question_number, domain, question_text, options, correct_answer, base_explanation, keywords')
      .in('id', questionIds);

    if (questionsError) {
      console.error('[WrongQ] Error fetching questions:', questionsError);
      return NextResponse.json({ error: questionsError.message }, { status: 500 });
    }

    // 4. 在内存中合并数据
    const questionMap = new Map((questionsData || []).map((q) => [q.id, q]));
    const data = wrongRecords.map((r) => ({
      id: r.id,
      question_id: r.question_id,
      user_answer: r.user_answer,
      is_correct: r.is_correct,
      created_at: r.created_at,
      questions: questionMap.get(r.question_id) || null,
    }));

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
    const groupedQuestionIds = Object.keys(grouped);
    if (groupedQuestionIds.length > 0) {
      // 查询这些题目的所有正确记录
      const { data: correctData } = await supabase
        .from('user_progress')
        .select('question_id, created_at')
        .eq('user_id', userId)
        .eq('is_correct', true)
        .in('question_id', groupedQuestionIds)
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

    const response = NextResponse.json({ questions });

    // ═══════════════════ 禁用所有缓存 ═══════════════════
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
    response.headers.set('X-Content-Type-Options', 'nosniff');

    return response;
  } catch (error: any) {
    console.error('Wrong questions API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
