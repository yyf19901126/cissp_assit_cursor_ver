import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const COOKIE_NAME = 'cissp_token';

// 需要登录才能访问的路径
const PROTECTED_PATHS = ['/dashboard', '/quiz', '/settings', '/wrong-questions'];
// 已登录用户应跳转到 dashboard 的路径
const AUTH_PATHS = ['/login', '/register'];

function getSecret() {
  const secret = process.env.AUTH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) return null;
  return new TextEncoder().encode(secret);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(COOKIE_NAME)?.value;

  const isProtected = PROTECTED_PATHS.some((p) => pathname.startsWith(p));
  const isAuthPage = AUTH_PATHS.some((p) => pathname === p);

  // 验证 token
  let isValidToken = false;
  if (token) {
    const secret = getSecret();
    if (secret) {
      try {
        await jwtVerify(token, secret);
        isValidToken = true;
      } catch {
        // Token 无效或过期
      }
    }
  }

  // 受保护页面：未登录 → 跳转到登录页
  if (isProtected && !isValidToken) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 登录/注册页面：已登录 → 跳转到 dashboard
  if (isAuthPage && isValidToken) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/quiz/:path*',
    '/settings/:path*',
    '/wrong-questions/:path*',
    '/login',
    '/register',
  ],
};
