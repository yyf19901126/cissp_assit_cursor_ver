import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getUserFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

type QuestionOption = { label: string; text: string };

function normalizeOptions(raw: unknown): QuestionOption[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: QuestionOption[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null;
    const label = String((item as any).label || '').toUpperCase().trim();
    const text = String((item as any).text ?? '').trim();
    if (!label || !text) return null;
    out.push({ label, text });
  }
  const labels = out.map((o) => o.label).sort().join(',');
  if (labels !== 'A,B,C,D') return null;
  return out.sort((a, b) => a.label.localeCompare(b.label));
}

// PATCH /api/quiz/questions/[id]
// 管理员：更新题干、选项、正确答案、可用性
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authUser = await getUserFromRequest(request);
    if (!authUser || authUser.role !== 'admin') {
      return NextResponse.json({ error: '需要管理员权限' }, { status: 403 });
    }

    const id = params.id;
    if (!id) {
      return NextResponse.json({ error: '缺少题目 ID' }, { status: 400 });
    }

    const body = await request.json();
    const {
      question_text,
      options,
      correct_answer,
      is_available,
    } = body as {
      question_text?: string;
      options?: QuestionOption[];
      correct_answer?: string;
      is_available?: boolean;
    };

    const supabase = createServiceClient();

    const { data: existing, error: fetchError } = await supabase
      .from('questions')
      .select('id')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: '题目不存在' }, { status: 404 });
    }

    const patch: Record<string, unknown> = {};

    if (question_text !== undefined) {
      const t = String(question_text).trim();
      if (!t) {
        return NextResponse.json({ error: '题干不能为空' }, { status: 400 });
      }
      patch.question_text = t;
    }

    if (options !== undefined) {
      const normalized = normalizeOptions(options);
      if (!normalized) {
        return NextResponse.json(
          { error: '选项必须为 A、B、C、D 四条且文本非空' },
          { status: 400 }
        );
      }
      patch.options = normalized;
    }

    if (correct_answer !== undefined) {
      const ca = String(correct_answer).toUpperCase().trim();
      if (!['A', 'B', 'C', 'D'].includes(ca)) {
        return NextResponse.json({ error: '正确答案必须是 A/B/C/D' }, { status: 400 });
      }
      patch.correct_answer = ca;
    }

    if (is_available !== undefined) {
      if (typeof is_available !== 'boolean') {
        return NextResponse.json({ error: 'is_available 必须为布尔值' }, { status: 400 });
      }
      patch.is_available = is_available;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: '没有要更新的字段' }, { status: 400 });
    }

    const { data: updated, error: updateError } = await supabase
      .from('questions')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();

    if (updateError) {
      console.error('[PATCH question]', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    const { count: totalAvailable, error: countError } = await supabase
      .from('questions')
      .select('*', { count: 'exact', head: true })
      .eq('is_available', true);

    if (countError) {
      console.error('[PATCH question] count', countError);
    }

    return NextResponse.json({
      question: updated,
      total_available: totalAvailable ?? null,
    });
  } catch (error: any) {
    console.error('PATCH question error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
