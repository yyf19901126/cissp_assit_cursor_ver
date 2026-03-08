import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getUserFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// POST /api/quiz/submit
// 提交答案 — 每做完1道题立即记录进度（所有模式通用）
export async function POST(request: NextRequest) {
  try {
    const authUser = await getUserFromRequest(request);
    if (!authUser) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await request.json();
    const { question_id, user_answer, time_spent, mode } = body;

    if (!question_id || !user_answer) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // 获取正确答案
    const { data: question, error: qError } = await supabase
      .from('questions')
      .select('correct_answer, base_explanation, keywords')
      .eq('id', question_id)
      .single();

    if (qError || !question) {
      return NextResponse.json({ error: '题目不存在' }, { status: 404 });
    }

    const isCorrect = user_answer.toUpperCase() === question.correct_answer.toUpperCase();
    const modeValue = mode || 'practice';

    // ═══════════════════ 记录做题进度 ═══════════════════
    // 去重逻辑：检查近1小时内是否已有同一用户+同一题的记录
    // 如果有，更新答案；如果没有，插入新记录
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

      const { data: existing } = await supabase
        .from('user_progress')
        .select('id')
        .eq('user_id', authUser.sub)
        .eq('question_id', question_id)
        .gte('created_at', oneHourAgo)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing) {
        // 更新已有记录（用户在同一次做题中改了答案）
        const { error: updateError } = await supabase
          .from('user_progress')
          .update({
            user_answer: user_answer.toUpperCase(),
            is_correct: isCorrect,
            time_spent: time_spent || 0,
            mode: modeValue,
          })
          .eq('id', existing.id);

        if (updateError) {
          console.error('Progress update error:', updateError);
        }
      } else {
        // 插入新记录
        const { error: insertError } = await supabase.from('user_progress').insert({
          user_id: authUser.sub,
          question_id,
          user_answer: user_answer.toUpperCase(),
          is_correct: isCorrect,
          time_spent: time_spent || 0,
          mode: modeValue,
        });

        if (insertError) {
          console.error('Progress insert error:', insertError);
          // 如果是外键约束错误（users 表或 questions 表相关），返回友好提示
          if (insertError.code === '23503') {
            return NextResponse.json({
              is_correct: isCorrect,
              correct_answer: question.correct_answer,
              explanation: question.base_explanation,
              keywords: question.keywords,
              warning: '进度保存失败：用户或题目关联错误',
            });
          }
        }
      }
    } catch (err) {
      console.error('Progress save exception:', err);
    }

    return NextResponse.json({
      is_correct: isCorrect,
      correct_answer: question.correct_answer,
      explanation: question.base_explanation,
      keywords: question.keywords,
    });
  } catch (error: any) {
    console.error('Submit API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
