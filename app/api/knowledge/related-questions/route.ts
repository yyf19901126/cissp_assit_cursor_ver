import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getUserFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET /api/knowledge/related-questions?term=xxx
// 根据术语检索关联题目（优先 knowledge_tags，其次题干关键词）
export async function GET(request: NextRequest) {
  try {
    const authUser = await getUserFromRequest(request);
    if (!authUser) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const term = (searchParams.get('term') || '').trim();
    const limit = Math.min(30, Math.max(1, Number(searchParams.get('limit') || 12)));
    if (!term) {
      return NextResponse.json({ error: 'term 不能为空' }, { status: 400 });
    }

    const supabase = createServiceClient();
    const baseSelect =
      'id,question_number,domain,question_text,options,correct_answer,base_explanation,knowledge_tags,is_available';

    // 1) 先按显式知识点标签命中
    const { data: byTags, error: tagsErr } = await supabase
      .from('questions')
      .select(baseSelect)
      .eq('is_available', true)
      .contains('knowledge_tags', [term])
      .order('question_number', { ascending: true })
      .limit(limit);
    if (tagsErr) {
      return NextResponse.json({ error: tagsErr.message }, { status: 500 });
    }

    let items = byTags || [];
    // 2) 如果标签命中不足，补充题干/关键词模糊匹配
    if (items.length < limit) {
      const remain = limit - items.length;
      const { data: fallback, error: fallbackErr } = await supabase
        .from('questions')
        .select(baseSelect)
        .eq('is_available', true)
        .or(`question_text.ilike.%${term}%,base_explanation.ilike.%${term}%`)
        .order('question_number', { ascending: true })
        .limit(remain + items.length);
      if (fallbackErr) {
        return NextResponse.json({ error: fallbackErr.message }, { status: 500 });
      }

      const seen = new Set(items.map((x: any) => x.id));
      for (const q of fallback || []) {
        if (seen.has(q.id)) continue;
        items.push(q);
        seen.add(q.id);
        if (items.length >= limit) break;
      }
    }

    return NextResponse.json({
      term,
      items,
      matched_by: byTags && byTags.length > 0 ? 'knowledge_tags+fallback' : 'fallback',
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
