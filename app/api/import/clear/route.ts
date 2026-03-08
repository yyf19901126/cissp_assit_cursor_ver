import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// DELETE /api/import/clear
// 清空题库
export async function DELETE(request: NextRequest) {
  try {
    const supabase = createServiceClient();

    // 先获取题目数量
    const { data: countData } = await supabase
      .from('questions')
      .select('id', { count: 'exact' });

    const totalBefore = countData?.length || 0;

    // 删除所有题目（使用 neq 一个不可能的值来匹配所有行）
    const { error } = await supabase
      .from('questions')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 同时清空相关的答题记录和考试会话
    await supabase
      .from('user_progress')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    await supabase
      .from('exam_sessions')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    return NextResponse.json({
      success: true,
      deleted: totalBefore,
      message: `已清空 ${totalBefore} 道题目及相关记录`,
    });
  } catch (error: any) {
    console.error('Clear Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
