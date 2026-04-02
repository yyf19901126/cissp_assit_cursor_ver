import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { createServiceClient } from '@/lib/supabase';
import { getUserFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const DEFAULT_MAX_FILE_MB = 50;
const FALLBACK_MAX_FILE_MB = 50;
const configuredMaxMb = Number(process.env.KNOWLEDGE_REVIEW_MAX_FILE_MB || DEFAULT_MAX_FILE_MB);
const MAX_FILE_MB = Number.isFinite(configuredMaxMb) && configuredMaxMb > 0
  ? Math.floor(configuredMaxMb)
  : DEFAULT_MAX_FILE_MB;
const MAX_FILE_SIZE = MAX_FILE_MB * 1024 * 1024;
const STORAGE_BUCKET = 'knowledge-review-pdfs';

function sanitizeFileName(name: string) {
  return name.replace(/[^\w.\-()\u4e00-\u9fa5 ]/g, '_');
}

function isMissingKnowledgeReviewTable(message: string) {
  const text = String(message || '').toLowerCase();
  return (
    text.includes("could not find the table 'public.knowledge_review_pdfs'") ||
    text.includes('relation "knowledge_review_pdfs" does not exist') ||
    text.includes('knowledge_review_pdfs')
  );
}

async function getLatestFromStorage(supabase: ReturnType<typeof createServiceClient>) {
  const { data: files, error } = await supabase.storage.from(STORAGE_BUCKET).list('uploads', {
    limit: 100,
    sortBy: { column: 'name', order: 'desc' },
  });
  if (error) throw error;
  if (!files || files.length === 0) return null;

  const latest = [...files].sort((a: any, b: any) => {
    const ta = new Date(a?.created_at || a?.updated_at || 0).getTime();
    const tb = new Date(b?.created_at || b?.updated_at || 0).getTime();
    return tb - ta;
  })[0] as any;

  const storagePath = `uploads/${latest.name}`;
  const { data: publicData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
  return {
    id: latest.id || latest.name,
    file_name: latest.name,
    file_path: publicData.publicUrl,
    file_url: publicData.publicUrl,
    file_size: Number(latest.metadata?.size || 0),
    mime_type: String(latest.metadata?.mimetype || 'application/pdf'),
    uploaded_at: latest.created_at || latest.updated_at || new Date().toISOString(),
  };
}

async function ensureStorageBucket(): Promise<number> {
  const supabase = createServiceClient();
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) throw listError;

  const applyBucketLimit = async (mb: number) => {
    return supabase.storage.updateBucket(STORAGE_BUCKET, {
      public: true,
      fileSizeLimit: `${mb}MB`,
      allowedMimeTypes: ['application/pdf'],
    });
  };

  const exists = (buckets || []).some((b) => b.name === STORAGE_BUCKET);
  if (exists) {
    // 旧 bucket 可能沿用了过小的 fileSizeLimit，显式更新一次避免 4MB 也被拒绝
    let { error: updateError } = await applyBucketLimit(MAX_FILE_MB);
    if (updateError && String(updateError.message || '').includes('maximum allowed size')) {
      const retry = await applyBucketLimit(FALLBACK_MAX_FILE_MB);
      updateError = retry.error || null;
    }
    if (updateError) throw updateError;
    const { data: bucketData } = await supabase.storage.getBucket(STORAGE_BUCKET);
    const currentLimit = Number(bucketData?.file_size_limit || 0);
    return Number.isFinite(currentLimit) && currentLimit > 0 ? currentLimit : MAX_FILE_SIZE;
  }

  let { error: createError } = await supabase.storage.createBucket(STORAGE_BUCKET, {
    public: true,
    fileSizeLimit: `${MAX_FILE_MB}MB`,
    allowedMimeTypes: ['application/pdf'],
  });
  if (createError && String(createError.message || '').includes('maximum allowed size')) {
    const retry = await supabase.storage.createBucket(STORAGE_BUCKET, {
      public: true,
      fileSizeLimit: `${FALLBACK_MAX_FILE_MB}MB`,
      allowedMimeTypes: ['application/pdf'],
    });
    createError = retry.error || null;
  }
  if (createError && !String(createError.message || '').includes('already exists')) {
    throw createError;
  }
  const { data: bucketData } = await supabase.storage.getBucket(STORAGE_BUCKET);
  const currentLimit = Number(bucketData?.file_size_limit || 0);
  return Number.isFinite(currentLimit) && currentLimit > 0 ? currentLimit : MAX_FILE_SIZE;
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
    await ensureStorageBucket();
    const { data, error } = await supabase
      .from('knowledge_review_pdfs')
      .select('*')
      .order('uploaded_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      if (isMissingKnowledgeReviewTable(error.message || '')) {
        const fallbackFile = await getLatestFromStorage(supabase);
        return NextResponse.json({ file: fallbackFile });
      }
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
      return NextResponse.json(
        { error: `文件大小不合法（当前最大 ${MAX_FILE_MB}MB）`, max_file_size: MAX_FILE_SIZE },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();
    const bucketLimit = await ensureStorageBucket();

    if (action === 'presign') {
      if (fileSize > bucketLimit) {
        const maxMb = Math.floor(bucketLimit / (1024 * 1024));
        return NextResponse.json(
          { error: `文件超过存储桶限制（当前最大 ${maxMb}MB）`, max_file_size: bucketLimit },
          { status: 400 }
        );
      }
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
        max_file_size: bucketLimit,
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
        if (isMissingKnowledgeReviewTable(error.message || '')) {
          return NextResponse.json({
            file: {
              id: storagePathInput,
              file_name: fileName,
              file_path: publicUrl,
              file_url: publicUrl,
              file_size: fileSize,
              mime_type: mimeType || 'application/pdf',
              uploaded_at: new Date().toISOString(),
            },
            warning: 'knowledge_review_pdfs 表不存在，已回退为仅存储模式',
          });
        }
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
