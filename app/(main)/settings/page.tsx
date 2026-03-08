'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Settings,
  Brain,
  Key,
  Save,
  CheckCircle,
  XCircle,
  Upload,
  Trash2,
  Loader2,
  FileText,
  AlertTriangle,
  Zap,
  Database,
  RefreshCw,
} from 'lucide-react';
import clsx from 'clsx';
import {
  AIConfig,
  DEFAULT_AI_CONFIG,
  MODEL_PRESETS,
  getAIConfig,
  saveAIConfig,
  isAIVerified,
  setAIVerified,
  clearAIVerified,
  isAIConfigComplete,
} from '@/lib/ai-config';

interface ImportProgress {
  status: 'idle' | 'uploading' | 'splitting' | 'parsing' | 'saving' | 'completed' | 'error';
  message: string;
  totalQuestions: number;
  parsedQuestions: number;
  savedQuestions: number;
  currentBatch: number;
  totalBatches: number;
  errors: string[];
}

export default function SettingsPage() {
  // AI 配置
  const [aiConfig, setAiConfig] = useState<AIConfig>(DEFAULT_AI_CONFIG);
  const [isCustomModel, setIsCustomModel] = useState(false);
  const [customModel, setCustomModel] = useState('');
  const [aiVerified, setAiVerifiedState] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [isSaved, setIsSaved] = useState(false);

  // PDF 导入
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importProgress, setImportProgress] = useState<ImportProgress>({
    status: 'idle',
    message: '',
    totalQuestions: 0,
    parsedQuestions: 0,
    savedQuestions: 0,
    currentBatch: 0,
    totalBatches: 0,
    errors: [],
  });

  // 题库管理
  const [questionCount, setQuestionCount] = useState<number | null>(null);
  const [isLoadingCount, setIsLoadingCount] = useState(true);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  // 初始化
  useEffect(() => {
    const config = getAIConfig();
    setAiConfig(config);
    setAiVerifiedState(isAIVerified());

    // 检查是否是自定义模型
    const isPreset = MODEL_PRESETS.some((p) => p.value === config.model);
    if (!isPreset && config.model) {
      setIsCustomModel(true);
      setCustomModel(config.model);
    }

    fetchQuestionCount();
  }, []);

  const fetchQuestionCount = async () => {
    setIsLoadingCount(true);
    try {
      const res = await fetch('/api/quiz/progress');
      if (res.ok) {
        const data = await res.json();
        setQuestionCount(data.overall?.total_questions || 0);
      }
    } catch {
      setQuestionCount(null);
    } finally {
      setIsLoadingCount(false);
    }
  };

  // AI 配置变更
  const handleConfigChange = (field: keyof AIConfig, value: string) => {
    setAiConfig((prev) => ({ ...prev, [field]: value }));
    clearAIVerified();
    setAiVerifiedState(false);
    setTestResult(null);
  };

  const handleModelChange = (value: string) => {
    if (value === 'custom') {
      setIsCustomModel(true);
      handleConfigChange('model', customModel || '');
    } else {
      setIsCustomModel(false);
      handleConfigChange('model', value);
    }
  };

  const handleSaveConfig = () => {
    const finalConfig = {
      ...aiConfig,
      model: isCustomModel ? customModel : aiConfig.model,
    };
    saveAIConfig(finalConfig);
    setAiConfig(finalConfig);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  // 测试 AI 连接
  const handleTestAI = async () => {
    setIsTesting(true);
    setTestResult(null);

    const finalConfig = {
      ...aiConfig,
      model: isCustomModel ? customModel : aiConfig.model,
    };

    try {
      const res = await fetch('/api/settings/test-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ai_config: finalConfig }),
      });

      const data = await res.json();

      if (data.success) {
        setTestResult({ success: true, message: data.message });
        setAIVerified(true);
        setAiVerifiedState(true);
        // 测试成功同时保存配置
        saveAIConfig(finalConfig);
        setAiConfig(finalConfig);
      } else {
        setTestResult({ success: false, message: data.error || '测试失败' });
        setAIVerified(false);
        setAiVerifiedState(false);
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: `网络错误: ${err.message || '请检查网络连接'}`,
      });
    } finally {
      setIsTesting(false);
    }
  };

  // PDF 导入流程
  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 重置进度
    setImportProgress({
      status: 'uploading',
      message: `正在上传 ${file.name}...`,
      totalQuestions: 0,
      parsedQuestions: 0,
      savedQuestions: 0,
      currentBatch: 0,
      totalBatches: 0,
      errors: [],
    });

    try {
      // Step 1: 上传并解析 PDF
      const formData = new FormData();
      formData.append('file', file);

      const uploadRes = await fetch('/api/import/upload', {
        method: 'POST',
        body: formData,
      });

      if (!uploadRes.ok) {
        const errData = await uploadRes.json();
        throw new Error(errData.error || '上传失败');
      }

      const uploadData = await uploadRes.json();
      const { raw_questions, raw_text, total_questions } = uploadData;

      if (total_questions === 0 && !raw_text) {
        throw new Error('PDF 中未找到任何题目');
      }

      // Step 2: 分批 AI 解析
      const BATCH_SIZE = 15; // 每批解析的题目数
      let allParsedQuestions: any[] = [];
      let errors: string[] = [];

      if (raw_questions && raw_questions.length > 0) {
        // 已识别格式，分批处理
        const totalBatches = Math.ceil(raw_questions.length / BATCH_SIZE);

        setImportProgress((prev) => ({
          ...prev,
          status: 'parsing',
          message: `AI 正在解析题目 (${totalBatches} 批)...`,
          totalQuestions: raw_questions.length,
          totalBatches,
        }));

        for (let i = 0; i < raw_questions.length; i += BATCH_SIZE) {
          const batch = raw_questions.slice(i, i + BATCH_SIZE);
          const batchIndex = Math.floor(i / BATCH_SIZE);

          setImportProgress((prev) => ({
            ...prev,
            currentBatch: batchIndex + 1,
            message: `AI 正在解析第 ${batchIndex + 1}/${totalBatches} 批...`,
          }));

          try {
            const parseRes = await fetch('/api/import/parse', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ai_config: aiConfig,
                raw_questions: batch,
                batch_index: batchIndex,
              }),
            });

            if (parseRes.ok) {
              const parseData = await parseRes.json();
              allParsedQuestions.push(...(parseData.questions || []));
              setImportProgress((prev) => ({
                ...prev,
                parsedQuestions: allParsedQuestions.length,
              }));
            } else {
              const errData = await parseRes.json();
              errors.push(`批次 ${batchIndex + 1}: ${errData.error}`);
            }
          } catch (batchErr: any) {
            errors.push(`批次 ${batchIndex + 1}: ${batchErr.message}`);
          }

          // 批次间延迟，避免 API 限流
          if (i + BATCH_SIZE < raw_questions.length) {
            await new Promise((r) => setTimeout(r, 1500));
          }
        }
      } else if (raw_text) {
        // 未识别格式，分段发送全文给 AI
        const TEXT_CHUNK_SIZE = 8000;
        const chunks: string[] = [];
        for (let i = 0; i < raw_text.length; i += TEXT_CHUNK_SIZE) {
          chunks.push(raw_text.substring(i, i + TEXT_CHUNK_SIZE));
        }

        const totalBatches = chunks.length;
        setImportProgress((prev) => ({
          ...prev,
          status: 'parsing',
          message: `AI 正在智能解析 PDF 内容 (${totalBatches} 段)...`,
          totalBatches,
        }));

        for (let i = 0; i < chunks.length; i++) {
          setImportProgress((prev) => ({
            ...prev,
            currentBatch: i + 1,
            message: `AI 正在智能解析第 ${i + 1}/${totalBatches} 段...`,
          }));

          try {
            const parseRes = await fetch('/api/import/parse', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ai_config: aiConfig,
                raw_text: chunks[i],
                batch_index: i,
              }),
            });

            if (parseRes.ok) {
              const parseData = await parseRes.json();
              allParsedQuestions.push(...(parseData.questions || []));
              setImportProgress((prev) => ({
                ...prev,
                parsedQuestions: allParsedQuestions.length,
              }));
            } else {
              const errData = await parseRes.json();
              errors.push(`段落 ${i + 1}: ${errData.error}`);
            }
          } catch (chunkErr: any) {
            errors.push(`段落 ${i + 1}: ${chunkErr.message}`);
          }

          if (i + 1 < chunks.length) {
            await new Promise((r) => setTimeout(r, 1500));
          }
        }
      }

      if (allParsedQuestions.length === 0) {
        throw new Error('AI 未能解析出任何题目，请检查 PDF 内容格式');
      }

      // Step 3: 保存到数据库
      setImportProgress((prev) => ({
        ...prev,
        status: 'saving',
        message: `正在保存 ${allParsedQuestions.length} 道题目到数据库...`,
        errors,
      }));

      // 分批保存
      const SAVE_BATCH = 50;
      let totalSaved = 0;
      for (let i = 0; i < allParsedQuestions.length; i += SAVE_BATCH) {
        const batch = allParsedQuestions.slice(i, i + SAVE_BATCH);

        try {
          const saveRes = await fetch('/api/import/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ questions: batch }),
          });

          if (saveRes.ok) {
            const saveData = await saveRes.json();
            totalSaved += saveData.inserted || 0;
            setImportProgress((prev) => ({
              ...prev,
              savedQuestions: totalSaved,
            }));
          } else {
            const errData = await saveRes.json();
            errors.push(`保存失败: ${errData.error}`);
          }
        } catch (saveErr: any) {
          errors.push(`保存失败: ${saveErr.message}`);
        }
      }

      // 完成
      setImportProgress({
        status: 'completed',
        message: `导入完成！成功保存 ${totalSaved} 道题目`,
        totalQuestions: raw_questions?.length || allParsedQuestions.length,
        parsedQuestions: allParsedQuestions.length,
        savedQuestions: totalSaved,
        currentBatch: 0,
        totalBatches: 0,
        errors,
      });

      // 刷新题目计数
      fetchQuestionCount();
    } catch (err: any) {
      setImportProgress((prev) => ({
        ...prev,
        status: 'error',
        message: err.message || '导入失败',
      }));
    }

    // 清除文件输入
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // 清空题库
  const handleClearQuestions = async () => {
    setIsClearing(true);
    try {
      const res = await fetch('/api/import/clear', { method: 'DELETE' });
      if (res.ok) {
        const data = await res.json();
        setQuestionCount(0);
        setShowClearConfirm(false);
        setImportProgress({
          status: 'idle',
          message: '',
          totalQuestions: 0,
          parsedQuestions: 0,
          savedQuestions: 0,
          currentBatch: 0,
          totalBatches: 0,
          errors: [],
        });
      } else {
        const errData = await res.json();
        alert(`清空失败: ${errData.error}`);
      }
    } catch (err: any) {
      alert(`清空失败: ${err.message}`);
    } finally {
      setIsClearing(false);
    }
  };

  const isImporting = ['uploading', 'splitting', 'parsing', 'saving'].includes(
    importProgress.status
  );
  const canImport = aiVerified && !isImporting;

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
          <Settings className="text-gray-500" />
          设置
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          配置 AI 模型并导入 PDF 题库
        </p>
      </div>

      {/* ═══════════════════ AI 配置 ═══════════════════ */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-800 p-6">
        <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
          <Brain size={20} className="text-purple-500" />
          AI 模型配置
        </h3>
        <p className="text-xs text-gray-400 mb-4">
          AI 配置用于题目解析和智能 AI 解析功能。Supabase 数据库连接已通过环境变量固定配置。
        </p>

        <div className="space-y-4">
          {/* API Key */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              API Key
            </label>
            <input
              type="password"
              value={aiConfig.api_key}
              onChange={(e) => handleConfigChange('api_key', e.target.value)}
              placeholder="sk-..."
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
            />
          </div>

          {/* Base URL */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Base URL
            </label>
            <input
              type="text"
              value={aiConfig.base_url}
              onChange={(e) => handleConfigChange('base_url', e.target.value)}
              placeholder="https://api.openai.com/v1"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
            />
            <p className="text-xs text-gray-400 mt-1">
              支持 OpenAI 兼容的自定义端点
            </p>
          </div>

          {/* 模型选择 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              模型
            </label>
            <select
              value={isCustomModel ? 'custom' : aiConfig.model}
              onChange={(e) => handleModelChange(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
            >
              {MODEL_PRESETS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
              <option value="custom">自定义模型...</option>
            </select>

            {isCustomModel && (
              <input
                type="text"
                value={customModel}
                onChange={(e) => {
                  setCustomModel(e.target.value);
                  handleConfigChange('model', e.target.value);
                }}
                placeholder="输入自定义模型名称"
                className="w-full mt-2 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
              />
            )}
          </div>
        </div>

        {/* 测试结果 */}
        {testResult && (
          <div
            className={clsx(
              'mt-4 p-3 rounded-xl text-sm flex items-start gap-2',
              testResult.success
                ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300'
                : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
            )}
          >
            {testResult.success ? (
              <CheckCircle size={18} className="flex-shrink-0 mt-0.5" />
            ) : (
              <XCircle size={18} className="flex-shrink-0 mt-0.5" />
            )}
            {testResult.message}
          </div>
        )}

        {/* 操作按钮 */}
        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={handleTestAI}
            disabled={isTesting || !aiConfig.api_key}
            className={clsx(
              'flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm transition-all',
              isTesting || !aiConfig.api_key
                ? 'bg-gray-200 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
                : 'bg-purple-600 text-white hover:bg-purple-700 shadow-lg shadow-purple-500/20'
            )}
          >
            {isTesting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                测试中...
              </>
            ) : (
              <>
                <Zap size={16} />
                测试连接
              </>
            )}
          </button>

          <button
            onClick={handleSaveConfig}
            className={clsx(
              'flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm transition-all',
              isSaved
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            )}
          >
            {isSaved ? (
              <>
                <CheckCircle size={16} />
                已保存
              </>
            ) : (
              <>
                <Save size={16} />
                保存配置
              </>
            )}
          </button>

          {/* 验证状态 */}
          {aiVerified && (
            <span className="ml-auto flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 font-medium">
              <CheckCircle size={14} />
              AI 已验证
            </span>
          )}
        </div>
      </div>

      {/* ═══════════════════ PDF 导入 ═══════════════════ */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-800 p-6">
        <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
          <FileText size={20} className="text-blue-500" />
          PDF 题库导入
        </h3>

        {/* 未验证 AI 时的提示 */}
        {!aiVerified && (
          <div className="mb-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 text-sm flex items-start gap-2">
            <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">请先配置并验证 AI 连接</p>
              <p className="text-xs mt-0.5 opacity-75">
                PDF 导入需要 AI 模型支持，用于将非结构化的题目文本解析为标准格式
              </p>
            </div>
          </div>
        )}

        {/* 上传区域 */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          onChange={handleFileChange}
          className="hidden"
        />

        <button
          onClick={handleFileSelect}
          disabled={!canImport}
          className={clsx(
            'w-full py-8 rounded-xl border-2 border-dashed transition-all flex flex-col items-center gap-3',
            canImport
              ? 'border-blue-300 dark:border-blue-700 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10 cursor-pointer'
              : 'border-gray-200 dark:border-gray-700 cursor-not-allowed opacity-50'
          )}
        >
          <Upload
            size={32}
            className={canImport ? 'text-blue-500' : 'text-gray-400'}
          />
          <div className="text-center">
            <p
              className={clsx(
                'font-medium text-sm',
                canImport
                  ? 'text-blue-700 dark:text-blue-300'
                  : 'text-gray-400'
              )}
            >
              {canImport ? '点击选择 PDF 文件' : '请先验证 AI 连接'}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              支持任意格式的 CISSP 题目 PDF，AI 将智能识别并解析
            </p>
          </div>
        </button>

        {/* 导入进度 */}
        {importProgress.status !== 'idle' && (
          <div className="mt-4 space-y-3">
            {/* 进度条 */}
            {isImporting && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400 flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin" />
                    {importProgress.message}
                  </span>
                  {importProgress.totalBatches > 0 && (
                    <span className="text-gray-500 text-xs">
                      {importProgress.currentBatch}/{importProgress.totalBatches}
                    </span>
                  )}
                </div>
                <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-500"
                    style={{
                      width: `${
                        importProgress.totalBatches > 0
                          ? (importProgress.currentBatch /
                              importProgress.totalBatches) *
                            100
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>
            )}

            {/* 统计信息 */}
            {(importProgress.parsedQuestions > 0 ||
              importProgress.savedQuestions > 0) && (
              <div className="flex gap-4 text-xs">
                <span className="text-gray-500">
                  AI 解析: {importProgress.parsedQuestions} 题
                </span>
                <span className="text-gray-500">
                  已保存: {importProgress.savedQuestions} 题
                </span>
              </div>
            )}

            {/* 完成/错误状态 */}
            {importProgress.status === 'completed' && (
              <div className="p-3 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 text-sm flex items-start gap-2">
                <CheckCircle size={18} className="flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">{importProgress.message}</p>
                  {importProgress.errors.length > 0 && (
                    <div className="mt-2 text-xs text-amber-600">
                      <p>{importProgress.errors.length} 个警告:</p>
                      {importProgress.errors.slice(0, 3).map((e, i) => (
                        <p key={i} className="mt-0.5">
                          • {e}
                        </p>
                      ))}
                      {importProgress.errors.length > 3 && (
                        <p className="mt-0.5">
                          ...还有 {importProgress.errors.length - 3} 个
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {importProgress.status === 'error' && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm flex items-start gap-2">
                <XCircle size={18} className="flex-shrink-0 mt-0.5" />
                {importProgress.message}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══════════════════ 题库管理 ═══════════════════ */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-800 p-6">
        <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
          <Database size={20} className="text-green-500" />
          题库管理
        </h3>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="text-center">
              <p className="text-3xl font-bold text-gray-900 dark:text-white">
                {isLoadingCount ? (
                  <Loader2 size={24} className="animate-spin inline" />
                ) : questionCount !== null ? (
                  questionCount
                ) : (
                  '--'
                )}
              </p>
              <p className="text-xs text-gray-500 mt-1">题目总量</p>
            </div>
            <button
              onClick={fetchQuestionCount}
              className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title="刷新"
            >
              <RefreshCw size={16} />
            </button>
          </div>

          <div>
            {!showClearConfirm ? (
              <button
                onClick={() => setShowClearConfirm(true)}
                disabled={
                  questionCount === 0 || questionCount === null || isClearing
                }
                className={clsx(
                  'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all',
                  questionCount && questionCount > 0
                    ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                )}
              >
                <Trash2 size={16} />
                清空题库
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-600 font-medium">
                  确认清空 {questionCount} 道题目？
                </span>
                <button
                  onClick={handleClearQuestions}
                  disabled={isClearing}
                  className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 transition-colors flex items-center gap-1"
                >
                  {isClearing ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Trash2 size={12} />
                  )}
                  确认
                </button>
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 text-xs font-medium hover:bg-gray-200 transition-colors"
                >
                  取消
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 说明 */}
      <div className="text-xs text-center text-gray-400 space-y-1">
        <p>
          AI API Key 存储在浏览器本地，不会上传到服务器存储
        </p>
        <p>
          Supabase 数据库连接通过环境变量配置，无需手动设置
        </p>
      </div>
    </div>
  );
}
