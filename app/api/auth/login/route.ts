import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createServiceClient } from '@/lib/supabase';
import { signToken, getAuthCookieOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// POST /api/auth/login
// 登录
export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json({ error: '用户名和密码不能为空' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // 查找用户
    const { data: user, error } = await supabase
      .from('users')
      .select('id, username, password_hash, role, ai_api_key, ai_base_url, ai_model, ai_verified')
      .eq('username', username.trim())
      .maybeSingle();

    if (error?.code === 'PGRST205') {
      console.error('users table not found. Run: node scripts/migrate.mjs <db_password>');
      return NextResponse.json({
        error: '数据库 users 表不存在，请先运行迁移脚本：node scripts/migrate.mjs <数据库密码>',
      }, { status: 500 });
    }

    if (error || !user) {
      return NextResponse.json({ error: '用户名或密码错误' }, { status: 401 });
    }

    // 验证密码
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return NextResponse.json({ error: '用户名或密码错误' }, { status: 401 });
    }

    // 签发 JWT
    const token = await signToken({
      sub: user.id,
      username: user.username,
      role: user.role,
    });

    const response = NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
      ai_settings: {
        api_key: user.ai_api_key || '',
        base_url: user.ai_base_url || 'https://api.openai.com/v1',
        model: user.ai_model || 'gpt-4o',
        verified: user.ai_verified || false,
      },
    });

    response.cookies.set(getAuthCookieOptions(token));

    return response;
  } catch (error: any) {
    console.error('Login API Error:', error);
    return NextResponse.json({ error: error.message || '登录失败' }, { status: 500 });
  }
}
