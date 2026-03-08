'use client';

import { useState } from 'react';
import { Search, Loader2, BookOpen, X } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '@/contexts/AuthContext';

interface TermResult {
  term_original: string;
  term_chinese: string;
  full_name: string;
  explanation: string;
  security_role: string;
  related_domain: string;
}

export default function TermLookup() {
  const { aiSettings } = useAuth();
  const [term, setTerm] = useState('');
  const [result, setResult] = useState<TermResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!term.trim()) return;

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const aiConfig = aiSettings.api_key ? {
        api_key: aiSettings.api_key,
        base_url: aiSettings.base_url,
        model: aiSettings.model,
      } : undefined;
      const res = await fetch('/api/ai/term-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          term: term.trim(),
          ai_config: aiConfig,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'AI 查询失败');
      }

      const data = await res.json();
      setResult(data.result);
    } catch (err: any) {
      setError(err.message || '查询失败，请检查 AI 配置');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isLoading) {
      handleSearch();
    }
  };

  const handleClear = () => {
    setTerm('');
    setResult(null);
    setError(null);
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-800 p-4">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
        <BookOpen size={16} className="text-amber-500" />
        名词速查
      </h3>

      {/* 搜索框 */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入术语, 如 PKI, SDLC..."
            className="w-full px-3 py-2 pr-8 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none transition-all"
            disabled={isLoading}
          />
          {term && !isLoading && (
            <button
              onClick={handleClear}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <button
          onClick={handleSearch}
          disabled={!term.trim() || isLoading}
          className={clsx(
            'px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1',
            !term.trim() || isLoading
              ? 'bg-gray-200 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
              : 'bg-amber-500 text-white hover:bg-amber-600 shadow-sm'
          )}
        >
          {isLoading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Search size={14} />
          )}
        </button>
      </div>

      {/* 结果显示 */}
      {isLoading && (
        <div className="mt-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/10 text-sm text-amber-700 dark:text-amber-300 flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" />
          正在查询...
        </div>
      )}

      {error && (
        <div className="mt-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/10 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-3 space-y-2">
          {/* 术语标题 */}
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-bold text-gray-900 dark:text-white text-sm">
              {result.term_chinese || result.term_original}
            </span>
            {result.full_name && (
              <span className="text-xs text-gray-500">
                {result.full_name}
              </span>
            )}
            {result.related_domain && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300">
                D{result.related_domain}
              </span>
            )}
          </div>

          {/* 解释 */}
          <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
            {result.explanation}
          </p>

          {/* 安全角色 */}
          {result.security_role && (
            <div className="p-2 rounded-lg bg-gray-50 dark:bg-gray-800 text-xs text-gray-600 dark:text-gray-400">
              <span className="font-medium text-gray-700 dark:text-gray-300">🔒 安全作用：</span>
              {result.security_role}
            </div>
          )}
        </div>
      )}

      <p className="mt-2 text-[10px] text-gray-400 dark:text-gray-600">
        仅供知识查阅，不涉及题目答案
      </p>
    </div>
  );
}
