/**
 * JWT 认证工具
 * 使用 jose 库（兼容 Edge Runtime / Node.js）
 */
import { jwtVerify, SignJWT } from 'jose';
import { NextRequest } from 'next/server';

export const COOKIE_NAME = 'cissp_token';
const JWT_EXPIRY = '7d';

function getSecret() {
  const secret = process.env.AUTH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error('No auth secret configured (set AUTH_SECRET or SUPABASE_SERVICE_ROLE_KEY)');
  return new TextEncoder().encode(secret);
}

export interface AuthPayload {
  sub: string;       // user_id
  username: string;
  role: 'admin' | 'user';
}

/** 签发 JWT Token */
export async function signToken(payload: AuthPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(JWT_EXPIRY)
    .setIssuedAt()
    .sign(getSecret());
}

/** 验证 JWT Token */
export async function verifyToken(token: string): Promise<AuthPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return {
      sub: payload.sub as string,
      username: payload.username as string,
      role: payload.role as 'admin' | 'user',
    };
  } catch {
    return null;
  }
}

/** 从 API Request 中提取用户信息 */
export async function getUserFromRequest(request: NextRequest): Promise<AuthPayload | null> {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

/** 生成 Set-Cookie 选项 */
export function getAuthCookieOptions(token: string) {
  return {
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  };
}

/** 生成清除 Cookie 的选项 */
export function getClearCookieOptions() {
  return {
    name: COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 0,
  };
}
