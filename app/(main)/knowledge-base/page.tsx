'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { CISSP_DOMAINS, KnowledgeTerm } from '@/types/database';
import { extractTermsFromPDF } from '@/lib/pdf-knowledge-parser';
import {
  BookOpen,
  Upload,
  Loader2,
  Search,
  Save,
  Trash2,
  Plus,
  ChevronDown,
} from 'lucide-react';
import clsx from 'clsx';

type ImportState = {
  status: 'idle' | 'parsing' | 'saving' | 'done' | 'error';
  message: string;
  total: number;
  saved: number;
  errors: string[];
};

const emptyCreate = {
  term_name: '',
  official_definition: '',
  domain_number: 1,
};

async function sha256File(file: File) {
  const buffer = await file.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default function KnowledgeBasePage() {
  const router = useRouter();
  const { user, loading: authLoading, isAdmin, aiSettings } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [items, setItems] = useState<KnowledgeTerm[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [query, setQuery] = useState('');
  const [domain, setDomain] = useState<number | ''>('');
  const [isNew, setIsNew] = useState<boolean | ''>('');
  const [mastery, setMastery] = useState<number | ''>('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  const [editing, setEditing] = useState<Record<string, Partial<KnowledgeTerm>>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [createData, setCreateData] = useState(emptyCreate);
  const [creating, setCreating] = useState(false);

  const [importState, setImportState] = useState<ImportState>({
    status: 'idle',
    message: '',
    total: 0,
    saved: 0,
    errors: [],
  });

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total]);

  const fetchTerms = useCallback(async () => {
    setLoadingList(true);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      if (domain !== '') params.set('domain', String(domain));
      if (isNew !== '') params.set('is_new_topic', String(isNew));
      if (mastery !== '') params.set('mastery_level', String(mastery));
      params.set('page', String(page));
      params.set('page_size', String(pageSize));

      const res = await fetch(`/api/knowledge/terms?${params.toString()}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '加载术语失败');
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoadingList(false);
    }
  }, [query, domain, isNew, mastery, page]);

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!authLoading && user) fetchTerms();
  }, [authLoading, user, fetchTerms]);

  const handleOpenUpload = () => fileRef.current?.click();

  const handleUpload = async (file: File) => {
    setImportState({
      status: 'parsing',
      message: '准备解析 PDF...',
      total: 0,
      saved: 0,
      errors: [],
    });

    try {
      const parsed = await extractTermsFromPDF(file, (msg) => {
        setImportState((prev) => ({ ...prev, message: msg }));
      });

      const hash = await sha256File(file);
      const sourceRes = await fetch('/api/knowledge/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          source_name: 'ISC2 CISSP Official Study Guide',
          source_version: '10th',
          file_name: file.name,
          file_sha256: hash,
          page_count: parsed.totalPages,
        }),
      });
      const sourceData = await sourceRes.json().catch(() => ({}));
      if (!sourceRes.ok) throw new Error(sourceData.error || '创建来源失败');

      const sourceId = sourceData.source?.id;
      if (!sourceId) throw new Error('未获取 source_id');

      // 客户端先按 term_key 去重，再分批导入
      const uniqMap = new Map<string, (typeof parsed.entries)[number]>();
      for (const e of parsed.entries) {
        const key = e.term_name.toLowerCase().trim().replace(/\s+/g, ' ');
        if (!uniqMap.has(key)) uniqMap.set(key, e);
      }
      const entries = [...uniqMap.values()];

      const CHUNK = 20;
      const totalChunks = Math.ceil(entries.length / CHUNK);
      let saved = 0;
      const errors: string[] = [];

      setImportState((prev) => ({
        ...prev,
        status: 'saving',
        total: entries.length,
        message: `开始增量导入 ${entries.length} 条术语...`,
      }));

      for (let i = 0; i < entries.length; i += CHUNK) {
        const chunk = entries.slice(i, i + CHUNK);
        setImportState((prev) => ({
          ...prev,
          message: `导入第 ${Math.floor(i / CHUNK) + 1}/${totalChunks} 批...`,
        }));

        const aiConfig = aiSettings.api_key
          ? {
              api_key: aiSettings.api_key,
              base_url: aiSettings.base_url,
              model: aiSettings.model,
            }
          : undefined;

        const res = await fetch('/api/knowledge/import-chunk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            source_id: sourceId,
            entries: chunk,
            ai_config: aiConfig,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          errors.push(`批次 ${Math.floor(i / CHUNK) + 1}: ${data.error || '失败'}`);
          continue;
        }
        saved += Number(data.saved || 0);
        setImportState((prev) => ({ ...prev, saved }));
      }

      setImportState((prev) => ({
        ...prev,
        status: 'done',
        message: `导入完成：处理 ${entries.length} 条，写入 ${saved} 条`,
        errors,
      }));
      setPage(1);
      fetchTerms();
    } catch (e: any) {
      setImportState((prev) => ({
        ...prev,
        status: 'error',
        message: e.message || '导入失败',
      }));
    }
  };

  const updateEditing = (id: string, patch: Partial<KnowledgeTerm>) => {
    setEditing((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || {}), ...patch },
    }));
  };

  const saveItem = async (item: KnowledgeTerm) => {
    const patch = editing[item.id];
    if (!patch || Object.keys(patch).length === 0) return;
    setSavingId(item.id);
    try {
      const res = await fetch(`/api/knowledge/terms/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(patch),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '保存失败');
      setItems((prev) => prev.map((x) => (x.id === item.id ? data.item : x)));
      setEditing((prev) => {
        const n = { ...prev };
        delete n[item.id];
        return n;
      });
    } catch (e: any) {
      alert(e.message || '保存失败');
    } finally {
      setSavingId(null);
    }
  };

  const deleteItem = async (id: string) => {
    if (!confirm('确认删除该术语？')) return;
    const res = await fetch(`/api/knowledge/terms/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return alert(data.error || '删除失败');
    setItems((prev) => prev.filter((x) => x.id !== id));
    setTotal((t) => Math.max(0, t - 1));
  };

  const createItem = async () => {
    if (!createData.term_name.trim() || !createData.official_definition.trim()) {
      return alert('term_name 与 official_definition 必填');
    }
    setCreating(true);
    try {
      const res = await fetch('/api/knowledge/terms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(createData),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '创建失败');
      setShowCreate(false);
      setCreateData(emptyCreate);
      setPage(1);
      fetchTerms();
    } catch (e: any) {
      alert(e.message || '创建失败');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="w-full min-w-0 max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <BookOpen className="text-indigo-500" />
            CISSP 复习知识库
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            术语上传、增量入库、检索与维护
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={handleOpenUpload}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
          >
            <Upload size={16} />
            上传并解析 PDF
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

      {importState.status !== 'idle' && (
        <div className="p-4 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/20">
          <p className="text-sm text-indigo-800 dark:text-indigo-200 flex items-center gap-2">
            {(importState.status === 'parsing' || importState.status === 'saving') && (
              <Loader2 size={16} className="animate-spin" />
            )}
            {importState.message}
          </p>
          {(importState.total > 0 || importState.saved > 0) && (
            <p className="text-xs text-indigo-700/80 dark:text-indigo-300/80 mt-1">
              总计 {importState.total} / 已写入 {importState.saved}
            </p>
          )}
          {importState.errors.length > 0 && (
            <div className="mt-2 text-xs text-amber-700 dark:text-amber-300 space-y-1">
              {importState.errors.slice(0, 4).map((e, i) => (
                <p key={i}>- {e}</p>
              ))}
            </div>
          )}
        </div>
      )}

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
              placeholder="搜索术语/定义/混淆点"
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
            value={isNew === '' ? '' : String(isNew)}
            onChange={(e) => {
              setPage(1);
              setIsNew(e.target.value === '' ? '' : e.target.value === 'true');
            }}
            className="px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm"
          >
            <option value="">全部考点</option>
            <option value="true">仅新增考点</option>
            <option value="false">非新增考点</option>
          </select>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500">共 {total} 条</p>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <button
                onClick={() => setShowCreate((v) => !v)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-sm"
              >
                <Plus size={14} /> 新增术语
              </button>
            )}
            <button
              onClick={fetchTerms}
              className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-sm"
            >
              刷新
            </button>
          </div>
        </div>

        {showCreate && isAdmin && (
          <div className="p-3 rounded-xl border border-dashed border-indigo-300 dark:border-indigo-700 space-y-2">
            <input
              placeholder="term_name"
              value={createData.term_name}
              onChange={(e) => setCreateData((p) => ({ ...p, term_name: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm bg-gray-50 dark:bg-gray-800"
            />
            <textarea
              placeholder="official_definition"
              rows={3}
              value={createData.official_definition}
              onChange={(e) =>
                setCreateData((p) => ({ ...p, official_definition: e.target.value }))
              }
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm bg-gray-50 dark:bg-gray-800"
            />
            <div className="flex items-center gap-2">
              <select
                value={createData.domain_number}
                onChange={(e) =>
                  setCreateData((p) => ({ ...p, domain_number: Number(e.target.value) }))
                }
                className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm bg-gray-50 dark:bg-gray-800"
              >
                {CISSP_DOMAINS.map((d) => (
                  <option key={d.id} value={d.id}>
                    Domain {d.id}
                  </option>
                ))}
              </select>
              <button
                onClick={createItem}
                disabled={creating}
                className={clsx(
                  'inline-flex items-center gap-1 px-3 py-2 rounded-lg text-sm text-white',
                  creating ? 'bg-gray-400' : 'bg-indigo-600 hover:bg-indigo-700'
                )}
              >
                {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                创建
              </button>
            </div>
          </div>
        )}

        {loadingList ? (
          <div className="py-10 text-center text-gray-500">
            <Loader2 className="animate-spin inline mr-2" size={16} />
            正在加载...
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              const patch = editing[item.id] || {};
              const merged = { ...item, ...patch } as KnowledgeTerm;
              const isExpanded = expandedId === item.id;
              return (
                <div key={item.id} className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    className="w-full px-3 py-3 text-left flex items-center gap-2"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="text-xs px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300">
                          D{merged.domain_number}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                          掌握 {merged.mastery_level}
                        </span>
                        {merged.is_new_topic && (
                          <span className="text-xs px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-200">
                            新考点
                          </span>
                        )}
                      </div>
                      <p className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">
                        {merged.term_name}
                      </p>
                    </div>
                    <ChevronDown
                      size={18}
                      className={clsx(
                        'text-gray-400 transition-transform',
                        isExpanded && 'rotate-180'
                      )}
                    />
                  </button>

                  {isExpanded && (
                    <div className="border-t border-gray-100 dark:border-gray-800 p-3 space-y-2">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <input
                          value={merged.term_name}
                          onChange={(e) => updateEditing(item.id, { term_name: e.target.value })}
                          disabled={!isAdmin}
                          className="px-2 py-1.5 rounded border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm font-semibold"
                        />
                        <select
                          value={merged.domain_number}
                          onChange={(e) =>
                            updateEditing(item.id, { domain_number: Number(e.target.value) as any })
                          }
                          disabled={!isAdmin}
                          className="px-2 py-1.5 rounded border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm"
                        >
                          {CISSP_DOMAINS.map((d) => (
                            <option key={d.id} value={d.id}>
                              D{d.id} {d.nameZh}
                            </option>
                          ))}
                        </select>
                      </div>

                      <textarea
                        value={merged.official_definition}
                        onChange={(e) =>
                          updateEditing(item.id, { official_definition: e.target.value })
                        }
                        disabled={!isAdmin}
                        rows={3}
                        placeholder="官方定义"
                        className="w-full px-2 py-1.5 rounded border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-xs"
                      />

                      <textarea
                        value={merged.concept_logic || ''}
                        onChange={(e) => updateEditing(item.id, { concept_logic: e.target.value })}
                        disabled={!isAdmin}
                        rows={2}
                        placeholder="管理核心点"
                        className="w-full px-2 py-1.5 rounded border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-xs"
                      />

                      <input
                        value={Array.isArray(merged.aka_synonyms) ? merged.aka_synonyms.join(', ') : ''}
                        onChange={(e) =>
                          updateEditing(item.id, {
                            aka_synonyms: e.target.value
                              .split(',')
                              .map((x) => x.trim())
                              .filter(Boolean),
                          })
                        }
                        disabled={!isAdmin}
                        placeholder="别名/同义词（英文逗号分隔）"
                        className="w-full px-2 py-1.5 rounded border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-xs"
                      />

                      <input
                        value={merged.process_step || ''}
                        onChange={(e) => updateEditing(item.id, { process_step: e.target.value })}
                        disabled={!isAdmin}
                        placeholder="流程步骤（可选）"
                        className="w-full px-2 py-1.5 rounded border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-xs"
                      />

                      <textarea
                        value={merged.confusion_points || ''}
                        onChange={(e) => updateEditing(item.id, { confusion_points: e.target.value })}
                        disabled={!isAdmin}
                        rows={2}
                        placeholder="易混淆点"
                        className="w-full px-2 py-1.5 rounded border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-xs"
                      />

                      <div className="grid grid-cols-2 gap-2">
                        <select
                          value={merged.mastery_level}
                          onChange={(e) =>
                            updateEditing(item.id, { mastery_level: Number(e.target.value) as any })
                          }
                          disabled={!isAdmin}
                          className="text-xs px-2 py-1.5 rounded border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800"
                        >
                          {[0, 1, 2, 3, 4, 5].map((m) => (
                            <option key={m} value={m}>
                              掌握 {m}
                            </option>
                          ))}
                        </select>
                        <label className="text-xs flex items-center gap-2 px-2 py-1.5 rounded border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                          <input
                            type="checkbox"
                            checked={Boolean(merged.is_new_topic)}
                            onChange={(e) =>
                              updateEditing(item.id, { is_new_topic: e.target.checked })
                            }
                            disabled={!isAdmin}
                          />
                          新考点
                        </label>
                      </div>

                      {isAdmin && (
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            onClick={() => saveItem(item)}
                            disabled={savingId === item.id}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-xs"
                          >
                            {savingId === item.id ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <Save size={12} />
                            )}
                            保存
                          </button>
                          <button
                            onClick={() => deleteItem(item.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-xs"
                          >
                            <Trash2 size={12} />
                            删除
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
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
    </div>
  );
}
