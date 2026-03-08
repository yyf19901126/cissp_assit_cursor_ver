import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

// POST /api/quiz/session
// 创建考试/练习/顺序刷题会话
// Body: {
//   user_id?, mode, question_count?,
//   domain? (单域,向后兼容), domains? (多域数组),
//   start_from? (顺序模式: 从第几题开始, question_number),
//   time_limit?
// }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      user_id,
      mode = 'practice',
      question_count = 25,
      domain,       // 单域 (向后兼容)
      domains,      // 多域数组
      start_from,   // 顺序模式: 起始 question_number
      time_limit,
    } = body;

    const supabase = createServiceClient();

    // 构建查询
    let query = supabase.from('questions').select('id, question_number').range(0, 9999);

    // 域筛选：优先使用 domains 数组，否则使用 domain 单值
    const domainFilter: number[] = domains && domains.length > 0
      ? domains
      : domain ? [domain] : [];

    if (domainFilter.length === 1) {
      query = query.eq('domain', domainFilter[0]);
    } else if (domainFilter.length > 1) {
      query = query.in('domain', domainFilter);
    }

    // 顺序模式：从指定题号之后开始
    if (mode === 'sequential' && start_from !== undefined && start_from > 0) {
      query = query.gt('question_number', start_from);
    }

    // 顺序模式始终按题号排序
    if (mode === 'sequential') {
      query = query.order('question_number', { ascending: true });
    }

    const { data: allQuestions, error } = await query;

    if (error) {
      console.error('Session query error:', error);
      return NextResponse.json({ error: `查询题目失败: ${error.message}` }, { status: 500 });
    }

    if (!allQuestions || allQuestions.length === 0) {
      if (mode === 'sequential' && start_from) {
        return NextResponse.json({
          error: 'no_more_questions',
          message: '已完成所有题目！',
        }, { status: 200 });
      }
      return NextResponse.json({ error: '没有可用的题目，请先导入题库' }, { status: 404 });
    }

    let questionIds: string[];
    let totalAvailable = allQuestions.length;

    if (mode === 'sequential') {
      // 顺序模式：取前 question_count 题（保持顺序）
      const batch = allQuestions.slice(0, Math.min(question_count, allQuestions.length));
      questionIds = batch.map((q: any) => q.id);
    } else {
      // 随机模式（练习/考试）
      const shuffled = [...allQuestions].sort(() => Math.random() - 0.5);
      const selected = shuffled.slice(0, Math.min(question_count, shuffled.length));
      questionIds = selected.map((q: any) => q.id);
    }

    // 查询总题数（用于顺序模式显示进度）
    let grandTotal = totalAvailable;
    if (mode === 'sequential') {
      // 查询不带 start_from 的总数
      let totalQuery = supabase.from('questions').select('*', { count: 'exact', head: true });
      if (domainFilter.length === 1) {
        totalQuery = totalQuery.eq('domain', domainFilter[0]);
      } else if (domainFilter.length > 1) {
        totalQuery = totalQuery.in('domain', domainFilter);
      }
      const { count } = await totalQuery;
      grandTotal = count || totalAvailable;
    }

    // 构建虚拟会话
    const virtualSession = {
      id: crypto.randomUUID(),
      mode,
      total_questions: questionIds.length,
      current_index: 0,
      question_ids: questionIds,
      answers: {},
      time_limit: mode === 'exam' ? (time_limit || 180) : null,
      start_time: new Date().toISOString(),
      is_virtual: true,
    };

    return NextResponse.json({
      session: virtualSession,
      total_available: totalAvailable,   // 此次可用题目数
      grand_total: grandTotal,           // 题库总题数（按筛选条件）
      has_more: totalAvailable > questionIds.length, // 是否还有更多题
    });
  } catch (error: any) {
    console.error('Session API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
