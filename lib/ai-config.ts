/**
 * 客户端 AI 配置管理
 * 存储在 localStorage，每次 AI 请求时传递给服务端
 */

export interface AIConfig {
  api_key: string;
  base_url: string;
  model: string;
}

const STORAGE_KEY = 'cissp_ai_config';
const VERIFIED_KEY = 'cissp_ai_verified';

// 默认配置
export const DEFAULT_AI_CONFIG: AIConfig = {
  api_key: '',
  base_url: 'https://api.openai.com/v1',
  model: 'gpt-4o',
};

// 预设模型列表
export const MODEL_PRESETS = [
  { value: 'gpt-4o', label: 'GPT-4o' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
  { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
  { value: 'gpt-4.1', label: 'GPT-4.1' },
  { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
  { value: 'gpt-4.1-nano', label: 'GPT-4.1 Nano' },
  { value: 'o3-mini', label: 'o3-mini' },
];

/** 从 localStorage 读取 AI 配置 */
export function getAIConfig(): AIConfig {
  if (typeof window === 'undefined') return DEFAULT_AI_CONFIG;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_AI_CONFIG, ...JSON.parse(stored) };
    }
  } catch {}
  return DEFAULT_AI_CONFIG;
}

/** 保存 AI 配置到 localStorage */
export function saveAIConfig(config: AIConfig): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

/** 检查 AI 是否已通过验证 */
export function isAIVerified(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(VERIFIED_KEY) === 'true';
}

/** 设置 AI 验证状态 */
export function setAIVerified(verified: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(VERIFIED_KEY, verified ? 'true' : 'false');
}

/** 清除 AI 验证状态（配置变更时调用） */
export function clearAIVerified(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(VERIFIED_KEY);
}

/** 检查 AI 配置是否完整 */
export function isAIConfigComplete(config: AIConfig): boolean {
  return !!(config.api_key && config.base_url && config.model);
}

/** 遮蔽 API Key 显示 */
export function maskApiKey(key: string): string {
  if (!key || key.length < 8) return '****';
  return key.substring(0, 4) + '****' + key.substring(key.length - 4);
}
