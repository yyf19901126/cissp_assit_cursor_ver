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

    // ═══════════════════ 获取用户答题数据 ═══════════════════
    // 策略：先查 user_progress，再查 questions，避免 join 在 Vercel 上的问题
    let progressData: any[] = [];
    
    // 1. 先查 user_progress（不 join）
    const { data: progressRecords, error: progressError } = await supabase
      .from('user_progress')
      .select('question_id, is_correct')
      .eq('user_id', userId);

    if (progressError) {
      console.error('[Progress] Error fetching user_progress:', progressError);
    } else if (progressRecords && progressRecords.length > 0) {
      // 2. 获取所有 question_id
      const questionIds = [...new Set(progressRecords.map((r) => r.question_id))];
      
      // 3. 批量查询 questions 获取 domain
      const { data: questionsData, error: questionsError } = await supabase
        .from('questions')
        .select('id, domain')
        .in('id', questionIds);

      if (questionsError) {
        console.error('[Progress] Error fetching questions:', questionsError);
        // 即使 questions 查询失败，也使用 progressRecords（只是没有 domain 信息）
        progressData = progressRecords.map((r) => ({ ...r, questions: null }));
      } else {
        // 4. 在内存中合并数据
        const questionMap = new Map((questionsData || []).map((q) => [q.id, q.domain]));
        progressData = progressRecords.map((r) => ({
          question_id: r.question_id,
          is_correct: r.is_correct,
          questions: { domain: questionMap.get(r.question_id) || null },
        }));
      }
      console.log('[Progress API] Fetched', progressData.length, 'records (method: separate queries)');
    } else {
      console.log('[Progress API] No progress records found for user', userId);
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
        progress_count: progressData.length,
        method: 'separate_queries',
      },
    });
  } catch (error: any) {
    console.error('Progress API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
