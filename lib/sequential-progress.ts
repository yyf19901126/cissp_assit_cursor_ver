/**
 * 顺序刷题进度管理
 * 存储在 localStorage，按用户 ID 隔离
 */

const SEQUENTIAL_KEY_PREFIX = 'cissp_seq_';

export interface SequentialProgress {
  lastQuestionNumber: number; // 最后完成的题号
  totalQuestions: number;     // 题库总题数
  answeredCount: number;      // 已答题数
  timestamp: string;          // 最近更新时间
}

function getKey(userId: string) {
  return `${SEQUENTIAL_KEY_PREFIX}${userId}`;
}

/** 获取顺序刷题进度 */
export function getSequentialProgress(userId: string): SequentialProgress | null {
  if (typeof window === 'undefined' || !userId) return null;
  try {
    const stored = localStorage.getItem(getKey(userId));
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

/** 保存顺序刷题进度 */
export function saveSequentialProgress(userId: string, progress: SequentialProgress): void {
  if (typeof window === 'undefined' || !userId) return;
  localStorage.setItem(getKey(userId), JSON.stringify(progress));
}

/** 清除顺序刷题进度 */
export function clearSequentialProgress(userId: string): void {
  if (typeof window === 'undefined' || !userId) return;
  localStorage.removeItem(getKey(userId));
}
