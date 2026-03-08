/**
 * 顺序刷题进度管理
 * 存储在数据库中，支持跨平台同步
 */

export interface SequentialProgress {
  lastQuestionNumber: number; // 最后完成的题号
  totalQuestions: number;     // 题库总题数
  answeredCount: number;       // 已答题数
  timestamp: string;          // 最近更新时间
}

/** 获取顺序刷题进度（从数据库） */
export async function getSequentialProgress(): Promise<SequentialProgress | null> {
  try {
    const res = await fetch('/api/quiz/sequential-progress', {
      credentials: 'include',
      cache: 'no-store',
    });
    if (res.ok) {
      const data = await res.json();
      return data.progress;
    }
    return null;
  } catch (error) {
    console.error('Failed to fetch sequential progress:', error);
    return null;
  }
}

/** 保存顺序刷题进度（到数据库） */
export async function saveSequentialProgress(progress: SequentialProgress): Promise<boolean> {
  try {
    const res = await fetch('/api/quiz/sequential-progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        lastQuestionNumber: progress.lastQuestionNumber,
        totalQuestions: progress.totalQuestions,
        answeredCount: progress.answeredCount,
      }),
    });
    return res.ok;
  } catch (error) {
    console.error('Failed to save sequential progress:', error);
    return false;
  }
}

/** 清除顺序刷题进度（从数据库） */
export async function clearSequentialProgress(): Promise<boolean> {
  try {
    const res = await fetch('/api/quiz/sequential-progress', {
      method: 'DELETE',
      credentials: 'include',
    });
    return res.ok;
  } catch (error) {
    console.error('Failed to clear sequential progress:', error);
    return false;
  }
}
