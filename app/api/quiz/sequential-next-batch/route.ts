import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getUserFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// POST /api/quiz/sequential-next-batch
// 顺序刷题模式：加载下一批题目（懒加载）
export async function POST(request: NextRequest) {
  try {
    const authUser = await getUserFromRequest(request);
    if (!authUser) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await request.json();
    const { start_from } = body; // 从哪个题号开始加载

    if (start_from === undefined) {
      return NextResponse.json({ error: '缺少 start_from 参数' }, { status: 400 });
    }

    const supabase = createServiceClient();
    const BATCH_SIZE = 100; // 每批100题

    // 获取下一批题目（从 start_from 之后开始）
    const { data: batchQuestions, error } = await supabase
      .from('questions')
      .select('id, question_number')
      .eq('is_available', true)
      .gt('question_number', start_from)
      .order('question_number', { ascending: true })
      .limit(BATCH_SIZE);

    if (error) {
      console.error('Next batch query error:', error);
      return NextResponse.json({ error: `查询题目失败: ${error.message}` }, { status: 500 });
    }

    if (!batchQuestions || batchQuestions.length === 0) {
      return NextResponse.json({
        questions: [],
        has_more: false,
        batch_end: start_from,
      });
    }

    const questionIds = batchQuestions.map((q: any) => q.id);
    const batchEnd = batchQuestions[batchQuestions.length - 1]?.question_number || start_from;
    const hasMore = batchQuestions.length === BATCH_SIZE;

    // 获取题目详情
    const { data: questionsData, error: questionsError } = await supabase
      .from('questions')
      .select('*')
      .eq('is_available', true)
      .in('id', questionIds)
      .order('question_number', { ascending: true });

    if (questionsError) {
      console.error('Questions detail error:', questionsError);
      return NextResponse.json({ error: `获取题目详情失败: ${questionsError.message}` }, { status: 500 });
    }

    // 保持顺序
    const orderedQuestions = questionIds
      .map((id: string) => (questionsData || []).find((q: any) => q.id === id))
      .filter(Boolean);

    return NextResponse.json({
      questions: orderedQuestions,
      has_more: hasMore,
      batch_end: batchEnd,
    });
  } catch (error: any) {
    console.error('Sequential next batch API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
