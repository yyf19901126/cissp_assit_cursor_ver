import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getUserFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// POST /api/quiz/sequential-load-by-number
// 顺序刷题模式：根据题号范围加载题目（按需加载）
export async function POST(request: NextRequest) {
  try {
    const authUser = await getUserFromRequest(request);
    if (!authUser) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await request.json();
    const { question_number } = body; // 要加载的题号

    if (question_number === undefined || question_number < 1) {
      return NextResponse.json({ error: '缺少或无效的题号' }, { status: 400 });
    }

    const supabase = createServiceClient();
    const BATCH_SIZE = 100; // 每批加载100题

    // 计算包含该题号的批次范围（向前后各扩展一些，确保包含该题）
    // 例如：如果题号是150，加载100-199
    const batchStart = Math.max(1, Math.floor((question_number - 1) / BATCH_SIZE) * BATCH_SIZE + 1);
    const batchEnd = batchStart + BATCH_SIZE - 1;

    // 获取该批次的所有题目
    const { data: questions, error } = await supabase
      .from('questions')
      .select('*')
      .gte('question_number', batchStart)
      .lte('question_number', batchEnd)
      .order('question_number', { ascending: true });

    if (error) {
      console.error('Load by number error:', error);
      return NextResponse.json({ error: `查询题目失败: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({
      questions: questions || [],
      batch_start: batchStart,
      batch_end: batchEnd,
    });
  } catch (error: any) {
    console.error('Sequential load by number API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
