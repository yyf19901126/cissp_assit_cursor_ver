import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getUserFromRequest } from '@/lib/auth';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

// POST /api/quiz/session
// 创建考试/练习/顺序刷题会话
export async function POST(request: NextRequest) {
  try {
    const authUser = await getUserFromRequest(request);
    if (!authUser) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await request.json();
    const {
      mode = 'practice',
      question_count = 25,
      domain,       // 单域 (向后兼容)
      domains,      // 多域数组
      start_from,   // 顺序模式: 起始 question_number
      time_limit,
      wrong_question_ids, // 错题ID列表（用于重做错题）
    } = body;

    const supabase = createServiceClient();

    // ═══════════════════ 重做错题模式 ═══════════════════
    // 如果提供了错题ID列表，直接使用这些题目
    if (wrong_question_ids && Array.isArray(wrong_question_ids) && wrong_question_ids.length > 0) {
      // 验证这些题目是否存在
      const { data: wrongQuestions, error: wrongQError } = await supabase
        .from('questions')
        .select('id, question_number')
        .in('id', wrong_question_ids);

      if (wrongQError) {
        console.error('Error fetching wrong questions:', wrongQError);
        return NextResponse.json({ error: `查询错题失败: ${wrongQError.message}` }, { status: 500 });
      }

      if (!wrongQuestions || wrongQuestions.length === 0) {
        return NextResponse.json({ error: '没有找到指定的错题' }, { status: 404 });
      }

      const questionIds = wrongQuestions.map((q: any) => q.id);

      const virtualSession = {
        id: crypto.randomUUID(),
        mode: 'practice', // 重做错题强制使用练习模式
        total_questions: questionIds.length,
        current_index: 0,
        question_ids: questionIds,
        answers: {},
        time_limit: null,
        start_time: new Date().toISOString(),
        is_virtual: true,
        is_wrong_questions_mode: true, // 标记这是错题重做模式
      };

      return NextResponse.json({
        session: virtualSession,
        total_available: questionIds.length,
        grand_total: questionIds.length,
        has_more: false,
      });
    }

    // ═══════════════════ 正常模式：从题库筛选 ═══════════════════
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
