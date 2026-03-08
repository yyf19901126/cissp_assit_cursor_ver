import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getUserFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET /api/quiz/sequential-answered-status
// 获取顺序刷题模式下所有已答题的状态（题号 -> 答题结果）
export async function GET(request: NextRequest) {
  try {
    const authUser = await getUserFromRequest(request);
    if (!authUser) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const supabase = createServiceClient();
    const userId = authUser.sub;

    // 获取用户的所有答题记录（分批获取，避免1000条限制）
    let allProgress: any[] = [];
    let from = 0;
    const batchSize = 1000;

    while (true) {
      const { data: batch, error } = await supabase
        .from('user_progress')
        .select('question_id, is_correct, user_answer')
        .eq('user_id', userId)
        .range(from, from + batchSize - 1);

      if (error) {
        console.error('Error fetching progress:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      if (!batch || batch.length === 0) break;
      allProgress = [...allProgress, ...batch];
      if (batch.length < batchSize) break;
      from += batchSize;
    }

    // 获取题目详情，建立题号映射
    const questionIds = [...new Set(allProgress.map((p) => p.question_id))];
    if (questionIds.length === 0) {
      return NextResponse.json({
        answered: {}, // question_number -> { is_correct, user_answer }
        correct: [],
        wrong: [],
      });
    }

    // 分批获取题目（避免1000条限制）
    let allQuestions: any[] = [];
    for (let i = 0; i < questionIds.length; i += 1000) {
      const batch = questionIds.slice(i, i + 1000);
      const { data: questions, error } = await supabase
        .from('questions')
        .select('id, question_number')
        .in('id', batch);

      if (error) {
        console.error('Error fetching questions:', error);
        continue;
      }
      if (questions) {
        allQuestions = [...allQuestions, ...questions];
      }
    }

    // 建立 id -> question_number 映射
    const idToNumber = new Map<string, number>();
    allQuestions.forEach((q) => {
      idToNumber.set(q.id, q.question_number);
    });

    // 构建题号到答题结果的映射
    const answered: Record<number, { is_correct: boolean; user_answer: string }> = {};
    const correct: number[] = [];
    const wrong: number[] = [];

    allProgress.forEach((p) => {
      const questionNumber = idToNumber.get(p.question_id);
      if (questionNumber) {
        answered[questionNumber] = {
          is_correct: p.is_correct,
          user_answer: p.user_answer,
        };
        if (p.is_correct) {
          correct.push(questionNumber);
        } else {
          wrong.push(questionNumber);
        }
      }
    });

    return NextResponse.json({
      answered,
      correct,
      wrong,
    });
  } catch (error: any) {
    console.error('Sequential answered status API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
