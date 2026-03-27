import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getUserFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET /api/quiz/unavailable-questions
// 管理员：列出已标记为不可用的题目
export async function GET(request: NextRequest) {
  try {
    const authUser = await getUserFromRequest(request);
    if (!authUser || authUser.role !== 'admin') {
      return NextResponse.json({ error: '需要管理员权限' }, { status: 403 });
    }

    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from('questions')
      .select('*')
      .eq('is_available', false)
      .order('question_number', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ questions: data || [] });
  } catch (error: any) {
    console.error('unavailable-questions error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
