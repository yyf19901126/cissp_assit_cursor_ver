/**
 * 匿名用户管理 + 顺序刷题进度管理
 * 所有数据存储在 localStorage
 */

const ANON_USER_KEY = 'cissp_anonymous_user_id';
const SEQUENTIAL_KEY = 'cissp_sequential_progress';

// ═══════════════════ 匿名用户 ═══════════════════

/** 获取或创建匿名用户 ID */
export function getAnonymousUserId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem(ANON_USER_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(ANON_USER_KEY, id);
  }
  return id;
}

// ═══════════════════ 顺序刷题进度 ═══════════════════

export interface SequentialProgress {
  lastQuestionNumber: number; // 最后完成的题号
  totalQuestions: number;     // 题库总题数
  answeredCount: number;      // 已答题数
  timestamp: string;          // 最近更新时间
}

/** 获取顺序刷题进度 */
export function getSequentialProgress(): SequentialProgress | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(SEQUENTIAL_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

/** 保存顺序刷题进度 */
export function saveSequentialProgress(progress: SequentialProgress): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SEQUENTIAL_KEY, JSON.stringify(progress));
}

/** 清除顺序刷题进度 */
export function clearSequentialProgress(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(SEQUENTIAL_KEY);
}
