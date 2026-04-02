import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getUserFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET /api/quiz/question-bank
// 管理员题库查询（含可用/停用）
export async function GET(request: NextRequest) {
  try {
    const authUser = await getUserFromRequest(request);
    if (!authUser || authUser.role !== 'admin') {
      return NextResponse.json({ error: '需要管理员权限' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const q = (searchParams.get('q') || '').trim();
    const domain = searchParams.get('domain');
    const availability = searchParams.get('availability') || 'all'; // all|available|unavailable
    const page = Math.max(1, Number(searchParams.get('page') || 1));
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get('page_size') || 20)));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const supabase = createServiceClient();
    let query = supabase
      .from('questions')
      .select('*', { count: 'exact' })
      .order('question_number', { ascending: true })
      .range(from, to);

    if (q) {
      query = query.or(`question_text.ilike.%${q}%,base_explanation.ilike.%${q}%`);
    }

    if (domain) {
      query = query.eq('domain', Number(domain));
    }

    if (availability === 'available') {
      query = query.eq('is_available', true);
    } else if (availability === 'unavailable') {
      query = query.eq('is_available', false);
    }

    const { data, count, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      items: data || [],
      total: count || 0,
      page,
      page_size: pageSize,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
