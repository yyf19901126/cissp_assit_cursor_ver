'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Question } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
import QuestionRepairAssistant from '@/components/QuestionRepairAssistant';
import { Ban, Loader2, RefreshCw, ChevronDown } from 'lucide-react';
import clsx from 'clsx';

export default function UnavailableQuestionsPage() {
  const router = useRouter();
  const { user, loading: authLoading, isAdmin, aiSettings } = useAuth();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [repairTarget, setRepairTarget] = useState<Question | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    if (!isAdmin) return;
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch('/api/quiz/unavailable-questions', {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 403) {
        setError('需要管理员权限');
        return;
      }
      if (!res.ok) {
        setError(data.error || '加载失败');
        return;
      }
      setQuestions(data.questions || []);
    } catch (e: any) {
      setError(e.message || '网络错误');
    } finally {
      setIsLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
      return;
    }
    if (!authLoading && user && !isAdmin) {
      router.push('/dashboard');
      return;
    }
    if (!authLoading && isAdmin) {
      fetchList();
    }
  }, [authLoading, user, isAdmin, router, fetchList]);

  const handleSaved = (updated: Question) => {
    if (updated.is_available !== false) {
      setQuestions((prev) => prev.filter((q) => q.id !== updated.id));
    } else {
      setQuestions((prev) => prev.map((q) => (q.id === updated.id ? updated : q)));
    }
    setRepairTarget(null);
  };

  if (authLoading || (!user && !error)) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="animate-spin text-indigo-500" size={40} />
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Ban className="text-amber-500" size={28} />
            已停用题目
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            这些题目仍保存在数据库中，但不会在练习中出现。可在此编辑并取消「不可用」以恢复。
          </p>
        </div>
        <button
          type="button"
          onClick={fetchList}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 self-start"
        >
          <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
          刷新
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-indigo-500" size={40} />
        </div>
      ) : questions.length === 0 ? (
        <div className="text-center py-16 text-gray-500 dark:text-gray-400 text-sm">
          当前没有已停用的题目
        </div>
      ) : (
        <div className="space-y-3">
          {questions.map((q) => (
            <div
              key={q.id}
              className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden"
            >
              <button
                type="button"
                onClick={() => setExpandedId(expandedId === q.id ? null : q.id)}
                className="w-full text-left p-4 flex items-start gap-3"
              >
                <span className="flex-shrink-0 px-2 py-1 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 text-xs font-bold">
                  #{q.question_number}
                </span>
                <p className="flex-1 min-w-0 text-sm text-gray-800 dark:text-gray-200 line-clamp-2">
                  {q.question_text}
                </p>
                <ChevronDown
                  size={20}
                  className={clsx(
                    'flex-shrink-0 text-gray-400 transition-transform',
                    expandedId === q.id && 'rotate-180'
                  )}
                />
              </button>
              {expandedId === q.id && (
                <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-800 pt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setRepairTarget(q)}
                    className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
                  >
                    打开修复助手（恢复可用）
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <QuestionRepairAssistant
        open={!!repairTarget}
        question={repairTarget}
        onClose={() => setRepairTarget(null)}
        onSaved={handleSaved}
        aiSettings={aiSettings}
      />
    </div>
  );
}
