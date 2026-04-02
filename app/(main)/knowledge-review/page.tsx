'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { KnowledgeTerm } from '@/types/database';
import { getSupabase } from '@/lib/supabase';
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

type TermDetailView = {
  term_name: string;
  domain_number: number;
  official_definition: string;
  concept_logic: string;
  aka_synonyms: string[];
  process_step: string;
  confusion_points: string;
  is_new_topic: boolean;
  source_type: 'knowledge_base' | 'ai_fallback';
};

function toTermViewFromDb(item: KnowledgeTerm): TermDetailView {
  return {
    term_name: item.term_name,
    domain_number: Number(item.domain_number || 1),
    official_definition: item.official_definition || '',
    concept_logic: item.concept_logic || '',
    aka_synonyms: Array.isArray(item.aka_synonyms) ? item.aka_synonyms : [],
    process_step: item.process_step || '',
    confusion_points: item.confusion_points || '',
    is_new_topic: Boolean(item.is_new_topic),
    source_type: 'knowledge_base',
  };
}

function toTermViewFromAI(result: any, query: string): TermDetailView {
  const relatedDomainRaw = String(result?.related_domain || '').trim();
  const match = relatedDomainRaw.match(/[1-8]/);
  const domain = match ? Number(match[0]) : 1;
  const fullName = String(result?.full_name || '').trim();
  const aliases = fullName
    ? fullName
        .split(',')
        .map((x: string) => x.trim())
        .filter(Boolean)
    : [];

  return {
    term_name:
      String(result?.term_chinese || '').trim() ||
      String(result?.term_original || '').trim() ||
      query,
    domain_number: domain,
    official_definition: String(result?.explanation || '').trim(),
    concept_logic: String(result?.security_role || '').trim(),
    aka_synonyms: aliases,
    process_step: '',
    confusion_points: '',
    is_new_topic: false,
    source_type: 'ai_fallback',
  };
}

export default function KnowledgeReviewPage() {
  const router = useRouter();
  const pathname = usePathname();
  const fileRef = useRef<HTMLInputElement>(null);
  const { user, loading: authLoading, isAdmin, aiSettings } = useAuth();

  const [pdf, setPdf] = useState<ReviewPdfFile | null>(null);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchItems, setSearchItems] = useState<KnowledgeTerm[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedTerm, setSelectedTerm] = useState<TermDetailView | null>(null);
  const [queryingAI, setQueryingAI] = useState(false);

  const [explaining, setExplaining] = useState(false);
  const [deepExplain, setDeepExplain] = useState<DeepExplainResult | null>(null);

  const [loadingRelated, setLoadingRelated] = useState(false);
  const [relatedQuestions, setRelatedQuestions] = useState<RelatedQuestion[]>([]);

  const [genCount, setGenCount] = useState(3);
  const [generating, setGenerating] = useState(false);
  const [mockQuestions, setMockQuestions] = useState<MockQuestion[]>([]);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, string>>({});
  const activeTab: 'document' | 'assistant' =
    pathname?.endsWith('/assistant') ? 'assistant' : 'document';

  const applySelectedTerm = useCallback((item: KnowledgeTerm) => {
    setSelectedTerm(toTermViewFromDb(item));
    setDeepExplain(null);
    setRelatedQuestions([]);
    setMockQuestions([]);
    setSelectedAnswers({});
    setShowDropdown(false);
    setQuery(item.term_name);
  }, []);


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
      const rawItems: KnowledgeTerm[] = data.items || [];
      const normalized = keyword.toLowerCase();
      const sorted = [...rawItems].sort((a, b) => {
        const aName = a.term_name.toLowerCase();
        const bName = b.term_name.toLowerCase();
        const aExact = aName === normalized ? 1 : 0;
        const bExact = bName === normalized ? 1 : 0;
        if (aExact !== bExact) return bExact - aExact;
        const aPrefix = aName.startsWith(normalized) ? 1 : 0;
        const bPrefix = bName.startsWith(normalized) ? 1 : 0;
        if (aPrefix !== bPrefix) return bPrefix - aPrefix;
        return aName.localeCompare(bName);
      });
      setSearchItems(sorted);
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
      const presignRes = await fetch('/api/knowledge-review/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'presign',
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type || 'application/pdf',
        }),
      });
      const presignData = await presignRes.json().catch(() => ({}));
      if (!presignRes.ok) throw new Error(presignData.error || '获取上传凭证失败');
      const uploadInfo = presignData.upload;
      const maxFileSize = Number(presignData.max_file_size || 0);
      if (!uploadInfo?.bucket || !uploadInfo?.storage_path || !uploadInfo?.token) {
        throw new Error('上传凭证无效');
      }

      const supabase = getSupabase();
      const { error: uploadError } = await supabase.storage
        .from(uploadInfo.bucket)
        .uploadToSignedUrl(uploadInfo.storage_path, uploadInfo.token, file);
      if (uploadError) {
        const message = String(uploadError.message || '');
        if (message.includes('maximum allowed size')) {
          const maxMb = maxFileSize > 0 ? Math.floor(maxFileSize / (1024 * 1024)) : null;
          throw new Error(
            maxMb
              ? `文件超出上传上限（当前最大 ${maxMb}MB），请压缩 PDF 后重试`
              : '文件超出上传上限，请压缩 PDF 后重试'
          );
        }
        throw new Error(uploadError.message || '上传文件失败');
      }

      const completeRes = await fetch('/api/knowledge-review/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'complete',
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type || 'application/pdf',
          storage_path: uploadInfo.storage_path,
        }),
      });
      const completeData = await completeRes.json().catch(() => ({}));
      if (!completeRes.ok) throw new Error(completeData.error || '保存文件信息失败');
      setPdf(completeData.file || null);
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
      setSelectedAnswers({});
    } catch (e: any) {
      alert(e.message || '生成拟真题失败');
    } finally {
      setGenerating(false);
    }
  };

  const runAiLookupWhenNoResult = async () => {
    const keyword = query.trim();
    if (!keyword) return;
    setQueryingAI(true);
    try {
      const res = await fetch('/api/ai/term-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          term: keyword,
          ai_config: aiConfig,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'AI 查询失败');
      const result = data.result || {};
      const mapped = toTermViewFromAI(result, keyword);
      setSelectedTerm(mapped);
      setDeepExplain(null);
      setRelatedQuestions([]);
      setMockQuestions([]);
      setSelectedAnswers({});
      setShowDropdown(false);
    } catch (e: any) {
      alert(e.message || 'AI 查询失败');
    } finally {
      setQueryingAI(false);
    }
  };

  const submitLookup = async () => {
    const keyword = query.trim();
    if (!keyword) return;
    const normalized = keyword.toLowerCase();
    const exact = searchItems.find((item) => item.term_name.toLowerCase() === normalized);
    if (exact) {
      applySelectedTerm(exact);
      return;
    }
    // 无精确命中时不自动替用户做选择，保留给用户主动触发 AI 查询
    setShowDropdown(true);
  };

  const normalizedQuery = query.trim().toLowerCase();
  const hasExactMatch = Boolean(
    normalizedQuery &&
      searchItems.some((item) => item.term_name.toLowerCase() === normalizedQuery)
  );

  return (
    <div className="w-full min-w-0 max-w-[1600px] mx-auto space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <BookOpen className="text-indigo-500" />
            知识点复习
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            文档浏览与知识点助手分开，复习体验更专注
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

      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800">
        <div className="p-2 border-b border-gray-200 dark:border-gray-800 flex items-center gap-2">
          <Link
            href="/knowledge-review"
            className={clsx(
              'px-4 py-2 rounded-xl text-sm font-medium',
              activeTab === 'document'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200'
            )}
          >
            复习文档
          </Link>
          <Link
            href="/knowledge-review/assistant"
            className={clsx(
              'px-4 py-2 rounded-xl text-sm font-medium',
              activeTab === 'assistant'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200'
            )}
          >
            知识点复习助手
          </Link>
        </div>

        {activeTab === 'document' ? (
          <section className="p-3 sm:p-4 flex flex-col">
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
              <div className="h-[calc(100vh-220px)] min-h-[640px] rounded-xl overflow-hidden border border-gray-200 dark:border-gray-800">
                <iframe
                  src={`${pdf.file_url}#toolbar=1&navpanes=0&scrollbar=1`}
                  className="w-full h-full"
                  title="knowledge-review-pdf"
                />
              </div>
            ) : (
              <div className="h-[calc(100vh-220px)] min-h-[640px] grid place-items-center text-center text-gray-500 px-4">
                <p className="text-sm">
                  暂无复习 PDF。请先上传 `The_sunflower_CISSP_Summary_Version_2.0.pdf`（或其他复习文档）。
                </p>
              </div>
            )}
          </section>
        ) : (
          <section className="p-3 sm:p-4 space-y-4 min-h-[78vh] overflow-y-auto">
            <div>
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">
                知识点复习助手
              </p>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setShowDropdown(true);
                  }}
                  onFocus={() => setShowDropdown(true)}
                  onBlur={() => {
                    setTimeout(() => setShowDropdown(false), 120);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !searching && !queryingAI) {
                      e.preventDefault();
                      submitLookup();
                    }
                  }}
                  placeholder="粘贴术语进行查询（如 BCP / ALE / BIA）"
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm"
                />
                <button
                  type="button"
                  onMouseDown={submitLookup}
                  disabled={!query.trim() || searching || queryingAI}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs px-2 py-1 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-200 disabled:opacity-50"
                >
                  查询
                </button>
                {!searching && query.trim() && !hasExactMatch && (
                  <button
                    type="button"
                    onMouseDown={runAiLookupWhenNoResult}
                    disabled={queryingAI}
                    className="absolute right-[54px] top-1/2 -translate-y-1/2 text-xs inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-200 disabled:opacity-50"
                  >
                    {queryingAI ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                    AI查询
                  </button>
                )}
                {showDropdown && query.trim() && (
                  <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg max-h-64 overflow-y-auto">
                    {searching ? (
                      <p className="px-3 py-2 text-xs text-gray-500">
                        <Loader2 size={12} className="inline animate-spin mr-1" />
                        查询中...
                      </p>
                    ) : searchItems.length > 0 ? (
                      <>
                        {!hasExactMatch && (
                          <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800 bg-violet-50/70 dark:bg-violet-900/10">
                            <p className="text-[11px] text-violet-700 dark:text-violet-300 mb-1">
                              未精确命中，建议使用 AI 查询该术语
                            </p>
                            <button
                              type="button"
                              onMouseDown={runAiLookupWhenNoResult}
                              disabled={queryingAI}
                              className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-200 disabled:opacity-50"
                            >
                              {queryingAI ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                              主动 AI 查询“{query.trim()}”
                            </button>
                          </div>
                        )}
                        {searchItems.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onMouseDown={() => {
                              applySelectedTerm(item);
                            }}
                            className={clsx(
                              'w-full text-left px-3 py-2 border-b border-gray-100 dark:border-gray-800 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-800',
                              selectedTerm?.term_name === item.term_name &&
                                'bg-indigo-50 dark:bg-indigo-900/20'
                            )}
                          >
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{item.term_name}</p>
                            <p className="text-xs text-gray-500 truncate">{item.official_definition}</p>
                          </button>
                        ))}
                      </>
                    ) : (
                      <div className="px-3 py-2 space-y-2">
                        <p className="text-xs text-gray-500">术语库没有直接命中</p>
                        <button
                          type="button"
                          onMouseDown={runAiLookupWhenNoResult}
                          disabled={queryingAI}
                          className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-200"
                        >
                          {queryingAI ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Sparkles size={12} />
                          )}
                          让 AI 查询该术语
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {selectedTerm && (
              <div className="space-y-3 pt-1">
                <div className="p-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800">
                  <p className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-2">术语详情</p>
                  {selectedTerm.source_type === 'ai_fallback' && (
                    <p className="text-xs text-violet-700 dark:text-violet-300 mb-2">
                      当前结果来自 AI 实时查询（术语库未命中）
                    </p>
                  )}
                  <div className="space-y-1.5 text-xs text-gray-700 dark:text-gray-300">
                    <p><span className="font-semibold">术语：</span>{selectedTerm.term_name}</p>
                    <p><span className="font-semibold">所属领域：</span>D{selectedTerm.domain_number}</p>
                    <p><span className="font-semibold">官方定义：</span>{selectedTerm.official_definition || '-'}</p>
                    <p><span className="font-semibold">管理逻辑：</span>{selectedTerm.concept_logic || '-'}</p>
                    <p><span className="font-semibold">别名/同义词：</span>{selectedTerm.aka_synonyms.join(', ') || '-'}</p>
                    <p><span className="font-semibold">流程阶段：</span>{selectedTerm.process_step || '-'}</p>
                    <p><span className="font-semibold">易混淆点：</span>{selectedTerm.confusion_points || '-'}</p>
                    <p><span className="font-semibold">是否新增考点：</span>{selectedTerm.is_new_topic ? '是' : '否'}</p>
                  </div>
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
                            <button
                              key={opt.label}
                              type="button"
                              onClick={() =>
                                setSelectedAnswers((prev) => ({ ...prev, [idx]: opt.label }))
                              }
                              className={clsx(
                                'w-full text-left text-xs px-2 py-1.5 rounded-lg border',
                                selectedAnswers[idx] === opt.label
                                  ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-200'
                                  : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'
                              )}
                            >
                              {opt.label}. {opt.text}
                            </button>
                          ))}
                        {!!selectedAnswers[idx] ? (
                          <>
                            <p
                              className={clsx(
                                'text-xs',
                                selectedAnswers[idx] === item.correct_answer
                                  ? 'text-green-700 dark:text-green-300'
                                  : 'text-amber-700 dark:text-amber-300'
                              )}
                            >
                              你的选择：{selectedAnswers[idx]}（正确答案：{item.correct_answer}）
                            </p>
                            <p className="text-xs text-gray-600 dark:text-gray-400">{item.explanation}</p>
                          </>
                        ) : (
                          <p className="text-xs text-gray-500 dark:text-gray-400">请选择一个选项后查看答案</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
