import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getUserFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET /api/quiz/progress
// 获取用户各域的掌握进度
export async function GET(request: NextRequest) {
  try {
    const authUser = await getUserFromRequest(request);
    if (!authUser) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }
    const userId = authUser.sub;
    console.log('[Progress API] userId from token:', userId);

    const supabase = createServiceClient();

    // 统计 8 大域
    const domains = [
      { id: 1, name: 'Security and Risk Management', nameZh: '安全与风险管理' },
      { id: 2, name: 'Asset Security', nameZh: '资产安全' },
      { id: 3, name: 'Security Architecture and Engineering', nameZh: '安全架构与工程' },
      { id: 4, name: 'Communication and Network Security', nameZh: '通信与网络安全' },
      { id: 5, name: 'Identity and Access Management (IAM)', nameZh: '身份与访问管理' },
      { id: 6, name: 'Security Assessment and Testing', nameZh: '安全评估与测试' },
      { id: 7, name: 'Security Operations', nameZh: '安全运营' },
      { id: 8, name: 'Software Development Security', nameZh: '软件开发安全' },
    ];

    // 使用 count 查询每个域的题目数量（不受 1000 行限制）
    let totalQuestionsCount = 0;
    const domainCountMap: Record<number, number> = {};

    // 先查总数
    const { count: overallCount, error: countError } = await supabase
      .from('questions')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      console.error('Error counting questions:', countError);
      return NextResponse.json({ error: countError.message }, { status: 500 });
    }

    totalQuestionsCount = overallCount || 0;

    // 查询每个域的题目数量
    for (const d of domains) {
      const { count, error } = await supabase
        .from('questions')
        .select('*', { count: 'exact', head: true })
        .eq('domain', d.id);

      if (error) {
        console.error(`Error counting domain ${d.id}:`, error);
        domainCountMap[d.id] = 0;
      } else {
        domainCountMap[d.id] = count || 0;
      }
    }

    // 先做一个简单的 count 查询（不用 join），确认数据存在
    const { count: rawCount, error: rawCountErr } = await supabase
      .from('user_progress')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);
    console.log('[Progress API] raw count for userId', userId, ':', rawCount, rawCountErr ? 'ERR:'+rawCountErr.message : 'OK');

    // 获取用户答题数据（带 join）
    let progressData: any[] = [];
    const { data, error: progressError } = await supabase
      .from('user_progress')
      .select('question_id, is_correct, questions!inner(domain)')
      .eq('user_id', userId);

    if (progressError) {
      console.error('[Progress] Error fetching user progress (with join):', progressError);
      // 如果 join 失败，尝试不用 join
      const { data: fallbackData, error: fallbackErr } = await supabase
        .from('user_progress')
        .select('question_id, is_correct')
        .eq('user_id', userId);
      if (!fallbackErr && fallbackData) {
        console.log('[Progress] Fallback query returned:', fallbackData.length, 'records');
        progressData = fallbackData;
      }
    } else {
      progressData = data || [];
      console.log('[Progress API] join query returned:', progressData.length, 'records');
    }

    const progress = domains.map((d) => {
      const totalInDomain = domainCountMap[d.id] || 0;

      const answeredInDomain = progressData.filter(
        (p: any) => (p.questions as any)?.domain === d.id
      );

      const uniqueQuestions = new Set(answeredInDomain.map((p: any) => p.question_id));
      const correctCount = answeredInDomain.filter((p: any) => p.is_correct).length;

      return {
        domain_id: d.id,
        domain_name: d.name,
        domain_name_zh: d.nameZh,
        total_questions: totalInDomain,
        answered_questions: uniqueQuestions.size,
        correct_count: correctCount,
        accuracy: answeredInDomain.length > 0
          ? Math.round((correctCount / answeredInDomain.length) * 100)
          : 0,
      };
    });

    // 总体统计
    const totalAnswered = progressData.length;
    const totalCorrect = progressData.filter((p: any) => p.is_correct).length;

    return NextResponse.json({
      domains: progress,
      overall: {
        total_questions: totalQuestionsCount,
        total_answered: totalAnswered,
        total_correct: totalCorrect,
        accuracy: totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0,
      },
      _debug: {
        user_id: userId,
        raw_progress_count: rawCount,
        join_progress_count: progressData.length,
      },
    });
  } catch (error: any) {
    console.error('Progress API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
