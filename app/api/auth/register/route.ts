import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createServiceClient } from '@/lib/supabase';
import { signToken, getAuthCookieOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// POST /api/auth/register
// 注册新用户（第一个用户自动成为管理员）
export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    // 校验
    if (!username || !password) {
      return NextResponse.json({ error: '用户名和密码不能为空' }, { status: 400 });
    }

    const trimmedUsername = username.trim();

    if (trimmedUsername.length < 2 || trimmedUsername.length > 30) {
      return NextResponse.json({ error: '用户名长度需要 2-30 个字符' }, { status: 400 });
    }

    if (!/^[a-zA-Z0-9_\u4e00-\u9fa5]+$/.test(trimmedUsername)) {
      return NextResponse.json({ error: '用户名只能包含字母、数字、下划线和中文' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: '密码长度至少 6 个字符' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // 检查用户名是否已存在
    const { data: existing, error: checkError } = await supabase
      .from('users')
      .select('id')
      .eq('username', trimmedUsername)
      .maybeSingle();

    if (checkError && checkError.code === 'PGRST205') {
      // users 表不存在
      console.error('users table not found. Run: node scripts/migrate.mjs <db_password>');
      return NextResponse.json({
        error: '数据库 users 表不存在，请先运行迁移脚本：node scripts/migrate.mjs <数据库密码>',
      }, { status: 500 });
    }

    if (existing) {
      return NextResponse.json({ error: '用户名已被使用' }, { status: 409 });
    }

    // 检查是否为第一个用户（自动成为管理员）
    const { count } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });

    const role = count === 0 ? 'admin' : 'user';

    // 哈希密码
    const password_hash = await bcrypt.hash(password, 12);

    // 创建用户
    const { data: user, error } = await supabase
      .from('users')
      .insert({
        username: trimmedUsername,
        password_hash,
        role,
      })
      .select('id, username, role')
      .single();

    if (error || !user) {
      console.error('Register error:', error);
      return NextResponse.json({ error: '注册失败，请重试' }, { status: 500 });
    }

    // 签发 JWT
    const token = await signToken({
      sub: user.id,
      username: user.username,
      role: user.role,
    });

    const response = NextResponse.json({
      user: { id: user.id, username: user.username, role: user.role },
      message: role === 'admin'
        ? '注册成功！你是第一个用户，已自动设为管理员 🎉'
        : '注册成功！',
    });

    response.cookies.set(getAuthCookieOptions(token));

    return response;
  } catch (error: any) {
    console.error('Register API Error:', error);
    return NextResponse.json({ error: error.message || '注册失败' }, { status: 500 });
  }
}
