import { NextRequest, NextResponse } from 'next/server';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { createServiceClient } from '@/lib/supabase';
import { getUserFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE = 60 * 1024 * 1024; // 60MB

function sanitizeFileName(name: string) {
  return name.replace(/[^\w.\-()\u4e00-\u9fa5 ]/g, '_');
}

// GET /api/knowledge-review/pdf
// 获取最新上传的复习 PDF
export async function GET(request: NextRequest) {
  try {
    const authUser = await getUserFromRequest(request);
    if (!authUser) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('knowledge_review_pdfs')
      .select('*')
      .order('uploaded_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ file: null });
    }

    return NextResponse.json({
      file: {
        ...data,
        file_url: data.file_path,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/knowledge-review/pdf
// 管理员上传复习 PDF，仅保存文件，不做解析
export async function POST(request: NextRequest) {
  try {
    const authUser = await getUserFromRequest(request);
    if (!authUser || authUser.role !== 'admin') {
      return NextResponse.json({ error: '仅管理员可上传' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: '请上传 PDF 文件' }, { status: 400 });
    }

    const ext = path.extname(file.name).toLowerCase();
    if (ext !== '.pdf') {
      return NextResponse.json({ error: '仅支持 PDF 文件' }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: '文件过大，限制 60MB' }, { status: 400 });
    }

    const dirFs = path.join(process.cwd(), 'public', 'knowledge-review');
    await mkdir(dirFs, { recursive: true });

    const safeName = sanitizeFileName(path.basename(file.name, '.pdf'));
    const unique = `${Date.now()}-${safeName}-${crypto.randomUUID().slice(0, 8)}.pdf`;
    const fileFsPath = path.join(dirFs, unique);
    const fileWebPath = `/knowledge-review/${unique}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(fileFsPath, buffer);

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('knowledge_review_pdfs')
      .insert({
        file_name: file.name,
        file_path: fileWebPath,
        file_size: file.size,
        mime_type: file.type || 'application/pdf',
        uploaded_by: authUser.sub,
      })
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      file: {
        ...data,
        file_url: data.file_path,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
