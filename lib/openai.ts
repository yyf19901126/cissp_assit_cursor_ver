import OpenAI from 'openai';

// AI 客户端 - 支持自定义模型端点（如 GPT-5.2/5.4）
export function createAIClient() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY!,
    baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
  });
}

// 当前使用的模型名
export function getModelName() {
  return process.env.OPENAI_MODEL || 'gpt-4o';
}
