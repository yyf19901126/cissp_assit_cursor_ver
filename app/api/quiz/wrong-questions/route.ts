import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getUserFromRequest } from '@/lib/auth';
import { revalidatePath, revalidateTag } from 'next/cache';

export const dynamic = 'force-dynamic';

// GET /api/quiz/wrong-questions
// 获取当前用户的错题列表
export async function GET(request: NextRequest) {
  try {
    // ═══════════════════ 禁用 Runtime Cache ═══════════════════
    // 使用 Next.js 的 revalidate API 来禁用 Runtime Cache
    // 这会确保每次请求都获取最新数据，而不是使用缓存的函数执行结果
    try {
      revalidatePath('/api/quiz/wrong-questions');
      revalidateTag('wrong-questions');
    } catch (e) {
      // revalidate 在某些环境下可能不可用，忽略错误
    }

    const authUser = await getUserFromRequest(request);
    if (!authUser) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }
    const userId = authUser.sub;
    
    // 显示数据库连接信息（用于排查 Vercel 和本地数据不一致问题）
    const dbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'NOT_SET';
    const dbUrlPreview = dbUrl.length > 20 ? dbUrl.substring(0, 20) + '...' : dbUrl;
    console.log('[WrongQ API] userId:', userId, '| DB URL:', dbUrlPreview);
    
    const supabase = createServiceClient();

    // ═══════════════════ 获取错题数据（避免 join 在 Vercel 上的问题）═══════════════════
    // 1. 先查错题总数
    const { count: wrongCount, error: countError } = await supabase
      .from('user_progress')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_correct', false);
    
    console.log('[WrongQ API] Wrong count query:', {
      userId,
      wrongCount,
      countError: countError?.message,
    });

    if (!wrongCount || wrongCount === 0) {
      console.log('[WrongQ] No wrong records found');
      return NextResponse.json({ questions: [] });
    }

    // 2. 分批获取所有错题记录（每批最多 1000 条）
    let wrongRecords: any[] = [];
    const BATCH_SIZE = 1000;
    const totalBatches = Math.ceil(wrongCount / BATCH_SIZE);
    
    for (let i = 0; i < totalBatches; i++) {
      const from = i * BATCH_SIZE;
      const to = from + BATCH_SIZE - 1;
      const { data: batch, error: batchError } = await supabase
        .from('user_progress')
        .select('id, question_id, user_answer, is_correct, created_at')
        .eq('user_id', userId)
        .eq('is_correct', false)
        .order('created_at', { ascending: false })
        .range(from, to);
      
      if (batchError) {
        console.error(`[WrongQ] Error fetching batch ${i}:`, batchError);
        return NextResponse.json({ error: batchError.message }, { status: 500 });
      }
      if (batch) {
        wrongRecords = [...wrongRecords, ...batch];
      }
    }

    console.log('[WrongQ API] Wrong records fetched:', {
      totalCount: wrongCount,
      recordsReturned: wrongRecords.length,
      batches: totalBatches,
    });

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
        // 为每个题目找到最新的正确记录
        const latestCorrectByQuestion = new Map<string, Date>();
        for (const correct of correctData) {
          const qId = correct.question_id;
          const correctDate = new Date(correct.created_at);
          if (!latestCorrectByQuestion.has(qId) || correctDate > latestCorrectByQuestion.get(qId)!) {
            latestCorrectByQuestion.set(qId, correctDate);
          }
        }

        // 检查每个错题是否已掌握
        for (const qId of groupedQuestionIds) {
          const latestCorrect = latestCorrectByQuestion.get(qId);
          if (latestCorrect && grouped[qId]) {
            const lastWrongDate = new Date(grouped[qId].last_attempt_at);
            // 如果最近一次正确的时间晚于最近一次错误的时间，标记为已掌握
            if (latestCorrect > lastWrongDate) {
              grouped[qId].is_mastered = true;
            }
          }
        }
      }
    }

    console.log('[WrongQ API] Stats:', {
      total_wrong_records: wrongRecords?.length || 0,
      grouped_count: groupedQuestionIds.length,
      mastered_count: Object.values(grouped).filter((q: any) => q.is_mastered).length,
      unmastered_count: Object.values(grouped).filter((q: any) => !q.is_mastered).length,
    });

    const questions = Object.values(grouped);

    const response = NextResponse.json({
      questions,
      _debug: {
        version: '2.0.0', // API 版本标识，用于确认 Vercel 是否运行最新代码
        timestamp: new Date().toISOString(),
        db_url_preview: dbUrlPreview, // 数据库 URL 预览（用于确认 Vercel 和本地是否连接同一数据库）
        total_wrong_records: wrongRecords?.length || 0,
        grouped_count: groupedQuestionIds.length,
        mastered_count: questions.filter((q: any) => q.is_mastered).length,
        unmastered_count: questions.filter((q: any) => !q.is_mastered).length,
      },
    });

    // ═══════════════════ 彻底禁用所有缓存（包括 Vercel 边缘网络缓存）═══════════════════
    // 关键：告诉 CDN 不要缓存，并且每次都要回源验证，禁用 SWR (Stale-While-Revalidate)
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    // Vercel 特定的缓存控制（必须设置）
    response.headers.set('CDN-Cache-Control', 'no-store');
    response.headers.set('Vercel-CDN-Cache-Control', 'no-store');
    // 添加随机数确保每次响应都不同（防止 Edge Functions 缓存）
    response.headers.set('X-Response-Id', `${Date.now()}-${Math.random().toString(36).substring(7)}`);
    // 明确告诉 Vercel 不要使用 SWR
    response.headers.set('X-Vercel-Cache-Control', 'no-store');

    return response;
  } catch (error: any) {
    console.error('Wrong questions API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
