import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getUserFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET /api/knowledge/terms
// 查询术语库（支持关键词、领域、新考点、掌握度）
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get('q') || '').trim();
    const domain = searchParams.get('domain');
    const isNew = searchParams.get('is_new_topic');
    const mastery = searchParams.get('mastery_level');
    const page = Math.max(1, Number(searchParams.get('page') || 1));
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get('page_size') || 20)));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const supabase = createServiceClient();
    let query = supabase
      .from('knowledge_terms')
      .select('*', { count: 'exact' })
      .order('term_name', { ascending: true })
      .range(from, to);

    if (q) {
      query = query.or(
        `term_name.ilike.%${q}%,official_definition.ilike.%${q}%,concept_logic.ilike.%${q}%,confusion_points.ilike.%${q}%`
      );
    }
    if (domain) {
      query = query.eq('domain_number', Number(domain));
    }
    if (isNew === 'true' || isNew === 'false') {
      query = query.eq('is_new_topic', isNew === 'true');
    }
    if (mastery !== null && mastery !== '') {
      query = query.eq('mastery_level', Number(mastery));
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

// POST /api/knowledge/terms
// 管理员手动新增术语
export async function POST(request: NextRequest) {
  try {
    const authUser = await getUserFromRequest(request);
    if (!authUser || authUser.role !== 'admin') {
      return NextResponse.json({ error: '仅管理员可操作' }, { status: 403 });
    }

    const body = await request.json();
    const term_name = String(body.term_name || '').trim();
    const official_definition = String(body.official_definition || '').trim();
    const domain_number = Number(body.domain_number || 1);
    if (!term_name || !official_definition) {
      return NextResponse.json({ error: 'term_name 与 official_definition 必填' }, { status: 400 });
    }
    if (domain_number < 1 || domain_number > 8) {
      return NextResponse.json({ error: 'domain_number 必须是 1-8' }, { status: 400 });
    }

    const term_key = term_name.toLowerCase().replace(/\s+/g, ' ').trim();
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('knowledge_terms')
      .insert({
        term_name,
        term_key,
        official_definition,
        domain_number,
        concept_logic: String(body.concept_logic || ''),
        aka_synonyms: Array.isArray(body.aka_synonyms) ? body.aka_synonyms : [],
        process_step: String(body.process_step || ''),
        confusion_points: String(body.confusion_points || ''),
        is_new_topic: Boolean(body.is_new_topic),
        mastery_level: Number(body.mastery_level || 0),
        updated_by: authUser.sub,
      })
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ item: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
