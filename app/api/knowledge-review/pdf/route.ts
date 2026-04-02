import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { createServiceClient } from '@/lib/supabase';
import { getUserFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE = 60 * 1024 * 1024; // 60MB
const STORAGE_BUCKET = 'knowledge-review-pdfs';

function sanitizeFileName(name: string) {
  return name.replace(/[^\w.\-()\u4e00-\u9fa5 ]/g, '_');
}

async function ensureStorageBucket() {
  const supabase = createServiceClient();
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) throw listError;

  const exists = (buckets || []).some((b) => b.name === STORAGE_BUCKET);
  if (exists) return;

  const { error: createError } = await supabase.storage.createBucket(STORAGE_BUCKET, {
    public: true,
    fileSizeLimit: `${MAX_FILE_SIZE}`,
    allowedMimeTypes: ['application/pdf'],
  });
  if (createError && !String(createError.message || '').includes('already exists')) {
    throw createError;
  }
}

function ensureAdmin(authUser: Awaited<ReturnType<typeof getUserFromRequest>>) {
  if (!authUser || authUser.role !== 'admin') {
    throw new Error('FORBIDDEN');
  }
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
    ensureAdmin(authUser);

    const body = await request.json();
    const action = String(body.action || 'presign');
    const fileName = String(body.file_name || '').trim();
    const mimeType = String(body.mime_type || 'application/pdf').trim();
    const fileSize = Number(body.file_size || 0);
    const storagePathInput = String(body.storage_path || '').trim();

    if (!fileName) {
      return NextResponse.json({ error: '缺少 file_name' }, { status: 400 });
    }
    const ext = path.extname(fileName).toLowerCase();
    if (ext !== '.pdf') {
      return NextResponse.json({ error: '仅支持 PDF 文件' }, { status: 400 });
    }
    if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > MAX_FILE_SIZE) {
      return NextResponse.json({ error: '文件大小不合法（最大 60MB）' }, { status: 400 });
    }

    const supabase = createServiceClient();
    await ensureStorageBucket();

    if (action === 'presign') {
      const safeName = sanitizeFileName(path.basename(fileName, '.pdf'));
      const unique = `${Date.now()}-${safeName}-${crypto.randomUUID().slice(0, 8)}.pdf`;
      const storagePath = `uploads/${unique}`;
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUploadUrl(storagePath);
      if (error || !data?.token) {
        return NextResponse.json({ error: error?.message || '生成上传凭证失败' }, { status: 500 });
      }
      return NextResponse.json({
        upload: {
          bucket: STORAGE_BUCKET,
          storage_path: storagePath,
          token: data.token,
        },
      });
    }

    if (action === 'complete') {
      if (!storagePathInput) {
        return NextResponse.json({ error: '缺少 storage_path' }, { status: 400 });
      }
      const { data: publicData } = supabase.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(storagePathInput);
      const publicUrl = publicData.publicUrl;

      const { data, error } = await supabase
        .from('knowledge_review_pdfs')
        .insert({
          file_name: fileName,
          file_path: publicUrl,
          file_size: fileSize,
          mime_type: mimeType || 'application/pdf',
          uploaded_by: authUser!.sub,
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
    }

    return NextResponse.json({ error: '不支持的 action' }, { status: 400 });
  } catch (error: any) {
    if (String(error?.message || '') === 'FORBIDDEN') {
      return NextResponse.json({ error: '仅管理员可上传' }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
