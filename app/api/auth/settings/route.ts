import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getUserFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET /api/auth/settings
// 获取当前用户的 AI 设置
export async function GET(request: NextRequest) {
  try {
    const payload = await getUserFromRequest(request);
    if (!payload) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const supabase = createServiceClient();

    const { data: user, error } = await supabase
      .from('users')
      .select('ai_api_key, ai_base_url, ai_model, ai_verified')
      .eq('id', payload.sub)
      .single();

    if (error || !user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    return NextResponse.json({
      ai_settings: {
        api_key: user.ai_api_key || '',
        base_url: user.ai_base_url || 'https://api.openai.com/v1',
        model: user.ai_model || 'gpt-4o',
        verified: user.ai_verified || false,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT /api/auth/settings
// 更新当前用户的 AI 设置
export async function PUT(request: NextRequest) {
  try {
    const payload = await getUserFromRequest(request);
    if (!payload) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await request.json();
    const { api_key, base_url, model, verified } = body;

    const supabase = createServiceClient();

    // 构建更新数据（只更新传入的字段）
    const updateData: Record<string, any> = {};
    if (api_key !== undefined) updateData.ai_api_key = api_key;
    if (base_url !== undefined) updateData.ai_base_url = base_url;
    if (model !== undefined) updateData.ai_model = model;
    if (verified !== undefined) updateData.ai_verified = verified;

    const { error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', payload.sub);

    if (error) {
      console.error('Update settings error:', error);
      return NextResponse.json({ error: '保存失败' }, { status: 500 });
    }

    // 返回更新后的完整设置
    const { data: user } = await supabase
      .from('users')
      .select('ai_api_key, ai_base_url, ai_model, ai_verified')
      .eq('id', payload.sub)
      .single();

    return NextResponse.json({
      ai_settings: {
        api_key: user?.ai_api_key || '',
        base_url: user?.ai_base_url || 'https://api.openai.com/v1',
        model: user?.ai_model || 'gpt-4o',
        verified: user?.ai_verified || false,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
