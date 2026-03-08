import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// POST /api/import/upload
// 此路由已不再使用 - PDF 改为客户端解析
// 保留此文件以避免 404 错误
export async function POST(request: NextRequest) {
  return NextResponse.json(
    {
      error: 'PDF 解析已迁移到客户端。请更新页面后重试。',
      message: '大文件 PDF 现在在浏览器中直接解析，无需上传到服务器。',
    },
    { status: 400 }
  );
}
