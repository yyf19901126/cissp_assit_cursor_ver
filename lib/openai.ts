import OpenAI from 'openai';

export interface DynamicAIConfig {
  api_key: string;
  base_url: string;
  model: string;
}

/**
 * 创建 AI 客户端 - 支持动态配置
 * 优先使用传入的配置，否则使用环境变量
 */
export function createAIClient(config?: DynamicAIConfig): OpenAI {
  const apiKey = config?.api_key || process.env.OPENAI_API_KEY;
  const baseURL = config?.base_url || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

  if (!apiKey) {
    throw new Error('AI API Key 未配置。请在设置页面配置 API Key，或在环境变量中设置 OPENAI_API_KEY');
  }

  return new OpenAI({ apiKey, baseURL });
}

/**
 * 获取模型名称
 * 优先使用传入的配置，否则使用环境变量
 */
export function getModelName(config?: DynamicAIConfig): string {
  return config?.model || process.env.OPENAI_MODEL || 'gpt-4o';
}
