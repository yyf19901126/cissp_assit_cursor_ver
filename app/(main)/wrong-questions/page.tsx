'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { CISSP_DOMAINS, Question } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
import {
  AlertTriangle,
  RotateCcw,
  CheckCircle,
  Filter,
  ChevronDown,
  BookOpen,
  Loader2,
  Inbox,
  RefreshCw,
} from 'lucide-react';
import clsx from 'clsx';

interface WrongQuestionItem {
  id: string;
  question: Question;
  user_answer: string;
  attempt_count: number;
  last_attempt_at: string;
  is_mastered: boolean;
}

export default function WrongQuestionsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [wrongQuestions, setWrongQuestions] = useState<WrongQuestionItem[]>([]);
  const [selectedDomain, setSelectedDomain] = useState<number | null>(null);
  const [showMastered, setShowMastered] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchWrongQuestions = useCallback(async () => {
    setFetchError(null);
    setIsLoading(true);
    try {
      const res = await fetch('/api/quiz/wrong-questions', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        console.log('[WrongQuestions] API returned', (data.questions || []).length, 'questions');
        setWrongQuestions(data.questions || []);
      } else if (res.status === 401) {
        console.log('[WrongQuestions] 401 - redirecting to login');
        setFetchError('未登录，正在跳转...');
        router.push('/login');
        return;
      } else {
        const errData = await res.json().catch(() => ({}));
        console.error('[WrongQuestions] API error:', res.status, errData);
        setFetchError(`加载失败: ${errData.error || res.status}`);
      }
    } catch (err: any) {
      console.error('[WrongQuestions] Fetch error:', err);
      setFetchError(`网络错误: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  // 当认证完成时获取数据（不依赖 user 对象，因为 API 从 cookie 读取）
  useEffect(() => {
    if (!authLoading) {
      fetchWrongQuestions();
    }
  }, [authLoading, fetchWrongQuestions]);

  // 页面可见时自动刷新（用户从其他页面返回时）
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !authLoading) {
        console.log('[WrongQuestions] Page visible, refreshing...');
        fetchWrongQuestions();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [authLoading, fetchWrongQuestions]);

  const filteredQuestions = wrongQuestions.filter((wq) => {
    if (selectedDomain && wq.question.domain !== selectedDomain) return false;
    if (!showMastered && wq.is_mastered) return false;
    return true;
  });

  // 按域分组统计
  const domainStats = CISSP_DOMAINS.map((d) => ({
    ...d,
    count: wrongQuestions.filter((wq) => wq.question.domain === d.id).length,
  }));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-indigo-500" size={40} />
          <p className="text-gray-500">加载错题记录...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* 标题 */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <AlertTriangle className="text-amber-500" />
            错题本
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            记录你做错的题目，针对性复习薄弱知识点
          </p>
        </div>
        <button
          onClick={fetchWrongQuestions}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-900/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="刷新数据"
        >
          <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
          <span className="text-sm font-medium">刷新</span>
        </button>
      </div>

      {/* 错误提示 */}
      {fetchError && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 flex items-center justify-between">
          <span className="text-red-700 dark:text-red-300 text-sm">⚠️ {fetchError}</span>
          <button
            onClick={fetchWrongQuestions}
            className="px-3 py-1 rounded-lg bg-red-100 dark:bg-red-800 text-red-700 dark:text-red-300 text-sm font-medium hover:bg-red-200"
          >
            重试
          </button>
        </div>
      )}

      {/* 域过滤器 */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-800 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={16} className="text-gray-500" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            按知识域筛选
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedDomain(null)}
            className={clsx(
              'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
              !selectedDomain
                ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'
            )}
          >
            全部 ({wrongQuestions.filter((wq) => !wq.is_mastered || showMastered).length})
          </button>
          {domainStats.map((d) => (
            <button
              key={d.id}
              onClick={() => setSelectedDomain(d.id)}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                selectedDomain === d.id
                  ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'
              )}
            >
              D{d.id} ({d.count})
            </button>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={showMastered}
              onChange={(e) => setShowMastered(e.target.checked)}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            显示已掌握
          </label>
          {wrongQuestions.length > 0 && (
            <button
              onClick={() =>
                router.push(
                  `/quiz?mode=practice${
                    selectedDomain ? `&domain=${selectedDomain}` : ''
                  }`
                )
              }
              className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              <RotateCcw size={16} />
              重做错题
            </button>
          )}
        </div>
      </div>

      {/* 错题列表 */}
      <div className="space-y-4">
        {filteredQuestions.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-800 p-12 text-center">
            <Inbox size={48} className="mx-auto text-gray-300 dark:text-gray-600 mb-4" />
            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200">
              {wrongQuestions.length === 0 ? '暂无错题记录' : '该域暂无错题'}
            </h3>
            <p className="text-gray-500 text-sm mt-2">
              {wrongQuestions.length === 0
                ? '开始答题后，错题会自动收录到这里'
                : '试试其他筛选条件'}
            </p>
            {wrongQuestions.length === 0 && (
              <button
                onClick={() => router.push('/quiz?mode=practice')}
                className="mt-4 px-6 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                去做题
              </button>
            )}
          </div>
        ) : (
          filteredQuestions.map((wq) => (
            <div
              key={wq.id}
              className={clsx(
                'bg-white dark:bg-gray-900 rounded-2xl shadow-lg border overflow-hidden transition-all',
                wq.is_mastered
                  ? 'border-green-200 dark:border-green-800 opacity-70'
                  : 'border-gray-100 dark:border-gray-800'
              )}
            >
              {/* 错题头部 */}
              <button
                onClick={() =>
                  setExpandedId(expandedId === wq.id ? null : wq.id)
                }
                className="w-full text-left p-5 flex items-start gap-4"
              >
                <span className="flex-shrink-0 w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600 dark:text-red-400 font-bold text-sm">
                  #{wq.question.question_number}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300">
                      Domain {wq.question.domain}
                    </span>
                    <span className="text-xs text-gray-400">
                      错误 {wq.attempt_count} 次
                    </span>
                    {wq.is_mastered && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                        已掌握
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-800 dark:text-gray-200 line-clamp-2">
                    {wq.question.question_text}
                  </p>
                </div>
                <ChevronDown
                  size={20}
                  className={clsx(
                    'flex-shrink-0 text-gray-400 transition-transform',
                    expandedId === wq.id && 'rotate-180'
                  )}
                />
              </button>

              {/* 展开详情 */}
              {expandedId === wq.id && (
                <div className="px-5 pb-5 border-t border-gray-100 dark:border-gray-800 pt-4">
                  {/* 选项 */}
                  <div className="space-y-2 mb-4">
                    {wq.question.options.map((opt) => (
                      <div
                        key={opt.label}
                        className={clsx(
                          'flex items-start gap-3 p-3 rounded-xl text-sm',
                          opt.label === wq.question.correct_answer
                            ? 'bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800'
                            : opt.label === wq.user_answer
                            ? 'bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800'
                            : 'bg-gray-50 dark:bg-gray-800'
                        )}
                      >
                        <span
                          className={clsx(
                            'flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
                            opt.label === wq.question.correct_answer
                              ? 'bg-green-500 text-white'
                              : opt.label === wq.user_answer
                              ? 'bg-red-500 text-white'
                              : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                          )}
                        >
                          {opt.label}
                        </span>
                        <span className="text-gray-700 dark:text-gray-300">
                          {opt.text}
                        </span>
                        {opt.label === wq.question.correct_answer && (
                          <CheckCircle
                            size={16}
                            className="flex-shrink-0 ml-auto text-green-500 mt-0.5"
                          />
                        )}
                      </div>
                    ))}
                  </div>

                  {/* 解析 */}
                  {wq.question.base_explanation && (
                    <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800">
                      <div className="flex items-center gap-2 mb-2">
                        <BookOpen size={16} className="text-blue-600" />
                        <span className="text-sm font-semibold text-blue-800 dark:text-blue-200">
                          解析
                        </span>
                      </div>
                      <p className="text-sm text-blue-700 dark:text-blue-300 leading-relaxed">
                        {wq.question.base_explanation}
                      </p>
                    </div>
                  )}

                  {/* 你的错误 */}
                  <div className="mt-3 p-3 rounded-xl bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800">
                    <p className="text-sm text-red-700 dark:text-red-300">
                      <span className="font-semibold">你的选择：</span>
                      {wq.user_answer} —{' '}
                      {wq.question.options.find(
                        (o) => o.label === wq.user_answer
                      )?.text}
                    </p>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
