import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// GET /api/quiz/progress
// 获取用户各域的掌握进度
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');

    const supabase = createServiceClient();

    // 获取每个域的题目总数
    const { data: domainCounts } = await supabase
      .from('questions')
      .select('domain');

    // 获取用户答题数据
    let progressData: any[] = [];
    if (userId) {
      const { data } = await supabase
        .from('user_progress')
        .select('question_id, is_correct, questions!inner(domain)')
        .eq('user_id', userId);
      progressData = data || [];
    }

    // 统计 8 大域进度
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

    const progress = domains.map((d) => {
      const totalInDomain = (domainCounts || []).filter(
        (q: any) => q.domain === d.id
      ).length;

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
        total_questions: (domainCounts || []).length,
        total_answered: totalAnswered,
        total_correct: totalCorrect,
        accuracy: totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
