'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { CISSP_DOMAINS, Question } from '@/types/database';
import QuestionRepairAssistant from '@/components/QuestionRepairAssistant';
import { Layers, Search, Loader2, ChevronDown, RefreshCw, Wrench } from 'lucide-react';
import clsx from 'clsx';

export default function QuestionBankPage() {
  const router = useRouter();
  const { user, loading: authLoading, isAdmin, aiSettings } = useAuth();

  const [items, setItems] = useState<Question[]>([]);
  const [query, setQuery] = useState('');
  const [domain, setDomain] = useState<number | ''>('');
  const [availability, setAvailability] = useState<'all' | 'available' | 'unavailable'>('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  const [isLoading, setIsLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [repairTarget, setRepairTarget] = useState<Question | null>(null);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total]);

  const fetchItems = useCallback(async () => {
    if (!isAdmin) return;
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      if (domain !== '') params.set('domain', String(domain));
      params.set('availability', availability);
      params.set('page', String(page));
      params.set('page_size', String(pageSize));

      const res = await fetch(`/api/quiz/question-bank?${params.toString()}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '加载题库失败');
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (e: any) {
      alert(e.message || '加载失败');
    } finally {
      setIsLoading(false);
    }
  }, [isAdmin, query, domain, availability, page]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
      return;
    }
    if (!authLoading && user && !isAdmin) {
      router.push('/dashboard');
      return;
    }
    if (!authLoading && isAdmin) fetchItems();
  }, [authLoading, user, isAdmin, router, fetchItems]);

  const onSaved = (updated: Question) => {
    setItems((prev) => prev.map((q) => (q.id === updated.id ? updated : q)));
    setRepairTarget(null);
  };

  return (
    <div className="w-full min-w-0 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Layers className="text-indigo-500" />
            题库管理
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            查询与修改题目（管理员）
          </p>
        </div>
        <button
          onClick={fetchItems}
          className="self-start flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-sm font-medium hover:bg-indigo-200"
        >
          <RefreshCw size={16} />
          刷新
        </button>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              value={query}
              onChange={(e) => {
                setPage(1);
                setQuery(e.target.value);
              }}
              placeholder="搜索题干/解析"
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm"
            />
          </div>
          <select
            value={domain}
            onChange={(e) => {
              setPage(1);
              setDomain(e.target.value ? Number(e.target.value) : '');
            }}
            className="px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm"
          >
            <option value="">全部领域</option>
            {CISSP_DOMAINS.map((d) => (
              <option key={d.id} value={d.id}>
                D{d.id} {d.nameZh}
              </option>
            ))}
          </select>
          <select
            value={availability}
            onChange={(e) => {
              setPage(1);
              const next = e.target.value as 'all' | 'available' | 'unavailable';
              setAvailability(next);
            }}
            className="px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm"
          >
            <option value="all">全部题目</option>
            <option value="available">仅可用</option>
            <option value="unavailable">仅停用</option>
          </select>
        </div>

        <p className="text-xs text-gray-500">共 {total} 道题</p>

        {isLoading ? (
          <div className="py-12 text-center text-gray-500">
            <Loader2 className="animate-spin inline mr-2" size={16} />
            正在加载...
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((q) => (
              <div
                key={q.id}
                className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setExpandedId(expandedId === q.id ? null : q.id)}
                  className="w-full p-3 text-left flex items-start gap-3"
                >
                  <span className="px-2 py-1 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-xs font-semibold">
                    #{q.question_number}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                        D{q.domain}
                      </span>
                      <span
                        className={clsx(
                          'text-xs px-2 py-0.5 rounded',
                          q.is_available === false
                            ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-200'
                            : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-200'
                        )}
                      >
                        {q.is_available === false ? '已停用' : '可用'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-800 dark:text-gray-200 truncate">{q.question_text}</p>
                  </div>
                  <ChevronDown
                    size={18}
                    className={clsx('text-gray-400 transition-transform', expandedId === q.id && 'rotate-180')}
                  />
                </button>

                {expandedId === q.id && (
                  <div className="border-t border-gray-100 dark:border-gray-800 p-3 space-y-2">
                    {q.options?.map((o) => (
                      <div
                        key={o.label}
                        className={clsx(
                          'text-sm p-2 rounded-lg border',
                          o.label === q.correct_answer
                            ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/10'
                            : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800'
                        )}
                      >
                        <span className="font-semibold mr-2">{o.label}.</span>
                        {o.text}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setRepairTarget(q)}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-700"
                    >
                      <Wrench size={16} />
                      题目修复助手
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-sm disabled:opacity-40"
          >
            上一页
          </button>
          <span className="text-sm text-gray-500">
            {page}/{totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-sm disabled:opacity-40"
          >
            下一页
          </button>
        </div>
      </div>

      <QuestionRepairAssistant
        open={!!repairTarget}
        question={repairTarget}
        onClose={() => setRepairTarget(null)}
        onSaved={onSaved}
        aiSettings={aiSettings}
      />
    </div>
  );
}
