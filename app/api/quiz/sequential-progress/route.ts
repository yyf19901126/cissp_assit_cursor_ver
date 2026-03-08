import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getUserFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET /api/quiz/sequential-progress
// 获取当前用户的顺序刷题进度
export async function GET(request: NextRequest) {
  try {
    const authUser = await getUserFromRequest(request);
    if (!authUser) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('sequential_progress')
      .select('last_question_number, total_questions, answered_count, updated_at')
      .eq('user_id', authUser.sub)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // 没有记录，返回 null
        return NextResponse.json({ progress: null });
      }
      console.error('Error fetching sequential progress:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      progress: data ? {
        lastQuestionNumber: data.last_question_number,
        totalQuestions: data.total_questions,
        answeredCount: data.answered_count,
        timestamp: data.updated_at,
      } : null,
    });
  } catch (error: any) {
    console.error('Sequential progress API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/quiz/sequential-progress
// 保存或更新当前用户的顺序刷题进度
export async function POST(request: NextRequest) {
  try {
    const authUser = await getUserFromRequest(request);
    if (!authUser) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await request.json();
    const { lastQuestionNumber, totalQuestions, answeredCount } = body;

    if (lastQuestionNumber === undefined || totalQuestions === undefined) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // 使用 upsert 来插入或更新
    const { data, error } = await supabase
      .from('sequential_progress')
      .upsert({
        user_id: authUser.sub,
        last_question_number: lastQuestionNumber,
        total_questions: totalQuestions,
        answered_count: answeredCount || 0,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id',
      })
      .select()
      .single();

    if (error) {
      console.error('Error saving sequential progress:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      progress: {
        lastQuestionNumber: data.last_question_number,
        totalQuestions: data.total_questions,
        answeredCount: data.answered_count,
        timestamp: data.updated_at,
      },
    });
  } catch (error: any) {
    console.error('Sequential progress API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/quiz/sequential-progress
// 清除当前用户的顺序刷题进度
export async function DELETE(request: NextRequest) {
  try {
    const authUser = await getUserFromRequest(request);
    if (!authUser) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const supabase = createServiceClient();
    const { error } = await supabase
      .from('sequential_progress')
      .delete()
      .eq('user_id', authUser.sub);

    if (error) {
      console.error('Error clearing sequential progress:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Sequential progress API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
