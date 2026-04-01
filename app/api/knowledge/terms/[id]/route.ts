import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getUserFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// PATCH /api/knowledge/terms/[id]
// 管理员更新术语
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authUser = await getUserFromRequest(request);
    if (!authUser || authUser.role !== 'admin') {
      return NextResponse.json({ error: '仅管理员可操作' }, { status: 403 });
    }

    const id = params.id;
    if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });

    const body = await request.json();
    const patch: Record<string, any> = {};

    if (body.term_name !== undefined) {
      const term_name = String(body.term_name).trim();
      if (!term_name) return NextResponse.json({ error: 'term_name 不能为空' }, { status: 400 });
      patch.term_name = term_name;
      patch.term_key = term_name.toLowerCase().replace(/\s+/g, ' ').trim();
    }
    if (body.official_definition !== undefined) patch.official_definition = String(body.official_definition || '');
    if (body.domain_number !== undefined) {
      const n = Number(body.domain_number);
      if (n < 1 || n > 8) return NextResponse.json({ error: 'domain_number 必须是 1-8' }, { status: 400 });
      patch.domain_number = n;
    }
    if (body.concept_logic !== undefined) patch.concept_logic = String(body.concept_logic || '');
    if (body.aka_synonyms !== undefined) {
      patch.aka_synonyms = Array.isArray(body.aka_synonyms)
        ? body.aka_synonyms.map((x: any) => String(x))
        : [];
    }
    if (body.process_step !== undefined) patch.process_step = String(body.process_step || '');
    if (body.confusion_points !== undefined) patch.confusion_points = String(body.confusion_points || '');
    if (body.is_new_topic !== undefined) patch.is_new_topic = Boolean(body.is_new_topic);
    if (body.mastery_level !== undefined) {
      const m = Number(body.mastery_level);
      if (m < 0 || m > 5) return NextResponse.json({ error: 'mastery_level 必须是 0-5' }, { status: 400 });
      patch.mastery_level = m;
    }
    patch.updated_by = authUser.sub;
    patch.updated_at = new Date().toISOString();

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('knowledge_terms')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ item: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/knowledge/terms/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authUser = await getUserFromRequest(request);
    if (!authUser || authUser.role !== 'admin') {
      return NextResponse.json({ error: '仅管理员可操作' }, { status: 403 });
    }

    const id = params.id;
    if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });

    const supabase = createServiceClient();
    const { error } = await supabase.from('knowledge_terms').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
