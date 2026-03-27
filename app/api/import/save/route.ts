import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getUserFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// POST /api/import/save
// 将解析后的题目批量保存到 Supabase（仅管理员）
export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: '仅管理员可导入题库' }, { status: 403 });
    }

    const body = await request.json();
    const { questions } = body;

    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return NextResponse.json({ error: '没有题目可保存' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // 转换为数据库格式
    const rows = questions.map((q: any, idx: number) => ({
      question_number: q.question_number || idx + 1,
      domain: q.domain || 1,
      question_text: q.question_text || '',
      options: q.options || [],
      correct_answer: (q.correct_answer || 'A').toUpperCase(),
      base_explanation: q.base_explanation || '',
      keywords: q.keywords || [],
      is_available: true,
    }));

    // 先查询已有的最大题号
    const { data: maxRow } = await supabase
      .from('questions')
      .select('question_number')
      .order('question_number', { ascending: false })
      .limit(1);

    const maxExisting = maxRow && maxRow.length > 0 ? maxRow[0].question_number : 0;

    // 重新编号题目（从已有最大题号+1开始）
    const adjustedRows = rows.map((row: any, idx: number) => ({
      ...row,
      question_number: maxExisting + idx + 1,
    }));

    // 分批插入（每批 50 条）
    const batchSize = 50;
    let inserted = 0;
    let errors: string[] = [];

    for (let i = 0; i < adjustedRows.length; i += batchSize) {
      const batch = adjustedRows.slice(i, i + batchSize);
      const { error } = await supabase.from('questions').insert(batch);

      if (error) {
        errors.push(`第 ${i + 1}-${i + batch.length} 题: ${error.message}`);
      } else {
        inserted += batch.length;
      }
    }

    return NextResponse.json({
      success: errors.length === 0,
      inserted,
      total: questions.length,
      errors: errors.length > 0 ? errors : undefined,
      message: errors.length === 0
        ? `成功导入 ${inserted} 道题目`
        : `导入 ${inserted}/${questions.length} 道题目，${errors.length} 个批次失败`,
    });
  } catch (error: any) {
    console.error('Import Save Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
