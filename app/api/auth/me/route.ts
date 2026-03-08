import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getUserFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET /api/auth/me
// 获取当前登录用户信息 + AI 配置
export async function GET(request: NextRequest) {
  try {
    const payload = await getUserFromRequest(request);
    if (!payload) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const supabase = createServiceClient();

    const { data: user, error } = await supabase
      .from('users')
      .select('id, username, role, ai_api_key, ai_base_url, ai_model, ai_verified')
      .eq('id', payload.sub)
      .single();

    if (error || !user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    return NextResponse.json({
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
  } catch (error: any) {
    console.error('Auth Me Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
