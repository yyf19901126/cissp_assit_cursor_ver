import { NextResponse } from 'next/server';
import { getClearCookieOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// POST /api/auth/logout
// 退出登录（清除 cookie）
export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(getClearCookieOptions());
  return response;
}
