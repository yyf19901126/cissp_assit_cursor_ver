'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { KnowledgeTerm } from '@/types/database';
import {
  BookOpen,
  Upload,
  Search,
  Loader2,
  Sparkles,
  ListChecks,
  Wand2,
  FileText,
} from 'lucide-react';
import clsx from 'clsx';

type ReviewPdfFile = {
  id: string;
  file_name: string;
  file_url: string;
  uploaded_at: string;
};

type DeepExplainResult = {
  manager_view?: string;
  decision_focus?: string[];
  exam_traps?: string[];
  quick_compare?: string;
};

type RelatedQuestion = {
  id: string;
  question_number: number;
  domain: number;
  question_text: string;
};

type MockQuestion = {
  question: string;
  options: Array<{ label: string; text: string }>;
  correct_answer: string;
  explanation: string;
};

export default function KnowledgeReviewPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const { user, loading: authLoading, isAdmin, aiSettings } = useAuth();

  const [pdf, setPdf] = useState<ReviewPdfFile | null>(null);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchItems, setSearchItems] = useState<KnowledgeTerm[]>([]);
  const [selectedTerm, setSelectedTerm] = useState<KnowledgeTerm | null>(null);

  const [explaining, setExplaining] = useState(false);
  const [deepExplain, setDeepExplain] = useState<DeepExplainResult | null>(null);

  const [loadingRelated, setLoadingRelated] = useState(false);
  const [relatedQuestions, setRelatedQuestions] = useState<RelatedQuestion[]>([]);

  const [genCount, setGenCount] = useState(3);
  const [generating, setGenerating] = useState(false);
  const [mockQuestions, setMockQuestions] = useState<MockQuestion[]>([]);

  const aiConfig = useMemo(
    () =>
      aiSettings.api_key
        ? {
            api_key: aiSettings.api_key,
            base_url: aiSettings.base_url,
            model: aiSettings.model,
          }
        : undefined,
    [aiSettings]
  );

  const fetchLatestPdf = useCallback(async () => {
    setLoadingPdf(true);
    try {
      const res = await fetch('/api/knowledge-review/pdf', {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '加载 PDF 信息失败');
      setPdf(data.file || null);
    } catch (e: any) {
      console.error(e.message || e);
    } finally {
      setLoadingPdf(false);
    }
  }, []);

  const searchTerms = useCallback(async (q: string) => {
    const keyword = q.trim();
    if (!keyword) {
      setSearchItems([]);
      return;
    }
    setSearching(true);
    try {
      const params = new URLSearchParams({
        q: keyword,
        page: '1',
        page_size: '10',
      });
      const res = await fetch(`/api/knowledge/terms?${params.toString()}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '术语查询失败');
      setSearchItems(data.items || []);
    } catch (e: any) {
      console.error(e.message || e);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!authLoading && user) {
      fetchLatestPdf();
    }
  }, [authLoading, user, fetchLatestPdf]);

  useEffect(() => {
    const handle = setTimeout(() => {
      searchTerms(query);
    }, 250);
    return () => clearTimeout(handle);
  }, [query, searchTerms]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/knowledge-review/pdf', {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '上传失败');
      setPdf(data.file || null);
    } catch (e: any) {
      alert(e.message || '上传失败');
    } finally {
      setUploading(false);
    }
  };

  const runDeepExplain = async () => {
    if (!selectedTerm) return;
    setExplaining(true);
    setDeepExplain(null);
    try {
      const res = await fetch('/api/ai/term-deep-explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          term_name: selectedTerm.term_name,
          official_definition: selectedTerm.official_definition,
          concept_logic: selectedTerm.concept_logic,
          confusion_points: selectedTerm.confusion_points,
          ai_config: aiConfig,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'AI 说明失败');
      setDeepExplain(data.result || null);
    } catch (e: any) {
      alert(e.message || 'AI 说明失败');
    } finally {
      setExplaining(false);
    }
  };

  const runRelatedQuestions = async () => {
    if (!selectedTerm) return;
    setLoadingRelated(true);
    setRelatedQuestions([]);
    try {
      const params = new URLSearchParams({
        term: selectedTerm.term_name,
        limit: '12',
      });
      const res = await fetch(`/api/knowledge/related-questions?${params.toString()}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '关联题查询失败');
      setRelatedQuestions(data.items || []);
    } catch (e: any) {
      alert(e.message || '关联题查询失败');
    } finally {
      setLoadingRelated(false);
    }
  };

  const runGenerateMockQuestions = async () => {
    if (!selectedTerm) return;
    setGenerating(true);
    setMockQuestions([]);
    try {
      const res = await fetch('/api/ai/generate-term-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          term_name: selectedTerm.term_name,
          official_definition: selectedTerm.official_definition,
          concept_logic: selectedTerm.concept_logic,
          count: genCount,
          ai_config: aiConfig,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '生成拟真题失败');
      setMockQuestions(Array.isArray(data.items) ? data.items : []);
    } catch (e: any) {
      alert(e.message || '生成拟真题失败');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="w-full min-w-0 max-w-[1600px] mx-auto space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <BookOpen className="text-indigo-500" />
            知识点复习
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            左侧浏览复习 PDF，右侧快速查询术语并进行强化复习
          </p>
        </div>

        {isAdmin && (
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className={clsx(
              'inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium',
              uploading
                ? 'bg-gray-300 text-gray-700'
                : 'bg-indigo-600 text-white hover:bg-indigo-700'
            )}
          >
            {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            上传复习 PDF（仅保存）
          </button>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUpload(file);
          e.currentTarget.value = '';
        }}
      />

      <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_1fr] gap-4 min-h-[72vh]">
        <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-3 sm:p-4 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
              <FileText size={16} />
              复习文档
            </p>
            {pdf && (
              <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[60%]">
                {pdf.file_name}
              </span>
            )}
          </div>

          {loadingPdf ? (
            <div className="flex-1 grid place-items-center text-gray-500">
              <div>
                <Loader2 className="animate-spin inline mr-2" size={16} />
                正在加载文档...
              </div>
            </div>
          ) : pdf ? (
            <div className="flex-1 min-h-[62vh] rounded-xl overflow-hidden border border-gray-200 dark:border-gray-800">
              <iframe
                src={`${pdf.file_url}#toolbar=1&navpanes=0&scrollbar=1`}
                className="w-full h-full"
                title="knowledge-review-pdf"
              />
            </div>
          ) : (
            <div className="flex-1 grid place-items-center text-center text-gray-500 px-4">
              <p className="text-sm">
                暂无复习 PDF。请先上传 `The_sunflower_CISSP_Summary_Version_2.0.pdf`（或其他复习文档）。
              </p>
            </div>
          )}
        </section>

        <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-3 sm:p-4 space-y-4 overflow-y-auto">
          <div>
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">
              知识点复习助手
            </p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="粘贴左侧术语进行查询（如 BCP / ALE / BIA）"
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm"
              />
            </div>
            {searching && (
              <p className="text-xs text-gray-500 mt-1">
                <Loader2 size={12} className="inline animate-spin mr-1" />
                查询中...
              </p>
            )}
          </div>

          {query.trim() && searchItems.length > 0 && (
            <div className="space-y-2">
              {searchItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setSelectedTerm(item);
                    setDeepExplain(null);
                    setRelatedQuestions([]);
                    setMockQuestions([]);
                  }}
                  className={clsx(
                    'w-full text-left px-3 py-2 rounded-xl border text-sm',
                    selectedTerm?.id === item.id
                      ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20'
                      : 'border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800'
                  )}
                >
                  <p className="font-medium text-gray-900 dark:text-gray-100">{item.term_name}</p>
                  <p className="text-xs text-gray-500 truncate">{item.official_definition}</p>
                </button>
              ))}
            </div>
          )}

          {selectedTerm && (
            <div className="space-y-3 pt-1">
              <div className="p-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800">
                <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{selectedTerm.term_name}</p>
                <p className="text-xs text-gray-500 mt-0.5">Domain {selectedTerm.domain_number}</p>
                <p className="text-sm text-gray-700 dark:text-gray-300 mt-2">
                  {selectedTerm.official_definition}
                </p>
                {selectedTerm.concept_logic && (
                  <p className="text-sm text-indigo-700 dark:text-indigo-300 mt-2">
                    {selectedTerm.concept_logic}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  onClick={runDeepExplain}
                  disabled={explaining}
                  className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-60"
                >
                  {explaining ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  AI 详细说明（CISSP视角）
                </button>

                <button
                  onClick={runRelatedQuestions}
                  disabled={loadingRelated}
                  className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-60"
                >
                  {loadingRelated ? <Loader2 size={14} className="animate-spin" /> : <ListChecks size={14} />}
                  查询相关题目
                </button>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={genCount}
                  onChange={(e) => setGenCount(Number(e.target.value))}
                  className="px-2 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm"
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n} 题
                    </option>
                  ))}
                </select>
                <button
                  onClick={runGenerateMockQuestions}
                  disabled={generating}
                  className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-violet-600 text-white text-sm hover:bg-violet-700 disabled:opacity-60"
                >
                  {generating ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                  AI 生成拟真题
                </button>
              </div>

              {deepExplain && (
                <div className="p-3 rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50 dark:bg-indigo-900/20 space-y-2">
                  {deepExplain.manager_view && (
                    <p className="text-sm text-gray-800 dark:text-gray-100">{deepExplain.manager_view}</p>
                  )}
                  {Array.isArray(deepExplain.decision_focus) && deepExplain.decision_focus.length > 0 && (
                    <ul className="text-xs text-gray-700 dark:text-gray-300 space-y-1">
                      {deepExplain.decision_focus.map((x, i) => (
                        <li key={i}>- {x}</li>
                      ))}
                    </ul>
                  )}
                  {deepExplain.quick_compare && (
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      易混区分：{deepExplain.quick_compare}
                    </p>
                  )}
                </div>
              )}

              {relatedQuestions.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                    关联题（{relatedQuestions.length}）
                  </p>
                  {relatedQuestions.map((q) => (
                    <div
                      key={q.id}
                      className="p-2 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800"
                    >
                      <p className="text-xs text-gray-500">#{q.question_number} · D{q.domain}</p>
                      <p className="text-sm text-gray-800 dark:text-gray-200">{q.question_text}</p>
                    </div>
                  ))}
                </div>
              )}

              {mockQuestions.length > 0 && (
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                    拟真题（{mockQuestions.length}）
                  </p>
                  {mockQuestions.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 space-y-2"
                    >
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {idx + 1}. {item.question}
                      </p>
                      {Array.isArray(item.options) &&
                        item.options.map((opt) => (
                          <p key={opt.label} className="text-xs text-gray-700 dark:text-gray-300">
                            {opt.label}. {opt.text}
                          </p>
                        ))}
                      <p className="text-xs text-green-700 dark:text-green-300">
                        答案：{item.correct_answer}
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">{item.explanation}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
