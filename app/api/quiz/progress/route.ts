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
    
    // 显示数据库连接信息（用于排查 Vercel 和本地数据不一致问题）
    const dbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'NOT_SET';
    const dbUrlPreview = dbUrl.length > 20 ? dbUrl.substring(0, 20) + '...' : dbUrl;
    console.log('[Progress API] userId:', userId, '| DB URL:', dbUrlPreview);
    
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
    
    // 1. 先查 user_progress（不 join，显式设置 limit 避免默认限制）
    // 注意：Supabase 默认 limit 是 1000，但 range(0, 9999) 应该能获取更多
    // 为了确保获取所有记录，我们先查 count，然后分批获取
    const { count: totalCount, error: progressCountError } = await supabase
      .from('user_progress')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);
    
    console.log('[Progress API] Total count query:', {
      userId,
      totalCount,
      progressCountError: progressCountError?.message,
    });

    // 分批获取所有记录（每批最多 1000 条，Supabase 的默认限制）
    let progressRecords: any[] = [];
    const BATCH_SIZE = 1000;
    const totalBatches = totalCount ? Math.ceil(totalCount / BATCH_SIZE) : 1;
    
    for (let i = 0; i < totalBatches; i++) {
      const from = i * BATCH_SIZE;
      const to = from + BATCH_SIZE - 1;
      const { data: batch, error: batchError } = await supabase
        .from('user_progress')
        .select('question_id, is_correct')
        .eq('user_id', userId)
        .range(from, to);
      
      if (batchError) {
        console.error(`[Progress] Error fetching batch ${i}:`, batchError);
        break;
      }
      if (batch) {
        progressRecords = [...progressRecords, ...batch];
      }
    }

    console.log('[Progress API] user_progress query result:', {
      userId,
      totalCount,
      recordsReturned: progressRecords.length,
      batches: totalBatches,
    });

    if (progressRecords && progressRecords.length > 0) {
      // 2. 获取所有 question_id
      const questionIds = [...new Set(progressRecords.map((r) => r.question_id))];
      console.log('[Progress API] Unique question_ids:', questionIds.length);
      
      // 3. 批量查询 questions 获取 domain（分批查询，避免 in() 参数过多）
      let questionMap = new Map<string, number | null>();
      const BATCH_SIZE = 100;
      for (let i = 0; i < questionIds.length; i += BATCH_SIZE) {
        const batch = questionIds.slice(i, i + BATCH_SIZE);
        const { data: questionsData, error: questionsError } = await supabase
          .from('questions')
          .select('id, domain')
          .in('id', batch);
        
        if (questionsError) {
          console.error(`[Progress] Error fetching questions batch ${i}-${i+BATCH_SIZE}:`, questionsError);
        } else if (questionsData) {
          questionsData.forEach((q) => questionMap.set(q.id, q.domain));
        }
      }
      
      console.log('[Progress API] Questions mapped:', questionMap.size, 'out of', questionIds.length);
      
      // 4. 在内存中合并数据
      progressData = progressRecords.map((r) => ({
        question_id: r.question_id,
        is_correct: r.is_correct,
        questions: { domain: questionMap.get(r.question_id) ?? null },
      }));
      
      console.log('[Progress API] Final progressData length:', progressData.length);
      console.log('[Progress API] Correct count:', progressData.filter((p) => p.is_correct).length);
      console.log('[Progress API] Wrong count:', progressData.filter((p) => !p.is_correct).length);
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

    // ═══════════════════ 总体统计（去重）═══════════════════
    // 按 question_id 去重，统计实际做过的题目数
    const uniqueQuestionIds = new Set(progressData.map((p: any) => p.question_id));
    const totalAnswered = uniqueQuestionIds.size;
    
    // 统计去重后的正确题数：每个题目只要答对过至少一次就算正确
    const correctQuestionIds = new Set(
      progressData
        .filter((p: any) => p.is_correct)
        .map((p: any) => p.question_id)
    );
    const totalCorrect = correctQuestionIds.size;
    
    console.log('[Progress API] Deduplication stats:', {
      raw_count: progressData.length,
      unique_questions: totalAnswered,
      correct_questions: totalCorrect,
      wrong_questions: totalAnswered - totalCorrect,
    });

    const response = NextResponse.json({
      domains: progress,
      overall: {
        total_questions: totalQuestionsCount,
        total_answered: Math.min(totalAnswered, totalQuestionsCount), // 确保不超过题库总数
        total_correct: totalCorrect,
        accuracy: totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0,
      },
      _debug: {
        user_id: userId,
        raw_progress_count: progressData.length, // 原始记录数（未去重）
        unique_questions: totalAnswered, // 去重后的题目数
        method: 'separate_queries',
        version: '2.0.0', // API 版本标识，用于确认 Vercel 是否运行最新代码
        timestamp: new Date().toISOString(),
        db_url_preview: dbUrlPreview, // 数据库 URL 预览（用于确认 Vercel 和本地是否连接同一数据库）
      },
    });

    // ═══════════════════ 禁用所有缓存 ═══════════════════
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
    response.headers.set('X-Content-Type-Options', 'nosniff');

    return response;
  } catch (error: any) {
    console.error('Progress API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
