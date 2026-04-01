import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getUserFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET /api/knowledge/sources
export async function GET() {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('knowledge_sources')
      .select('*')
      .order('uploaded_at', { ascending: false })
      .limit(20);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ sources: data || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/knowledge/sources
// 管理员创建/复用知识库来源记录（按 file_sha256 去重）
export async function POST(request: NextRequest) {
  try {
    const authUser = await getUserFromRequest(request);
    if (!authUser || authUser.role !== 'admin') {
      return NextResponse.json({ error: '仅管理员可操作' }, { status: 403 });
    }

    const body = await request.json();
    const {
      source_name = 'ISC2 CISSP Official Study Guide',
      source_version = '10th',
      file_name,
      file_sha256,
      page_count = 0,
    } = body as {
      source_name?: string;
      source_version?: string;
      file_name?: string;
      file_sha256?: string;
      page_count?: number;
    };

    if (!file_name || !file_sha256) {
      return NextResponse.json({ error: '缺少 file_name 或 file_sha256' }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { data: exists } = await supabase
      .from('knowledge_sources')
      .select('*')
      .eq('file_sha256', file_sha256)
      .maybeSingle();

    if (exists) {
      return NextResponse.json({ source: exists, existed: true });
    }

    const { data, error } = await supabase
      .from('knowledge_sources')
      .insert({
        source_name,
        source_version,
        file_name,
        file_sha256,
        page_count,
        uploaded_by: authUser.sub,
      })
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ source: data, existed: false });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
