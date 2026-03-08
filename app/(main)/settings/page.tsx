'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Settings,
  Brain,
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
  ShieldAlert,
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '@/contexts/AuthContext';
import { MODEL_PRESETS } from '@/lib/ai-config';
import { extractQuestionsFromPDF } from '@/lib/pdf-client-parser';

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
  const { user, aiSettings, updateAISettings, isAdmin } = useAuth();

  // AI 配置（本地编辑状态）
  const [editConfig, setEditConfig] = useState({
    api_key: '',
    base_url: 'https://api.openai.com/v1',
    model: 'gpt-4o',
  });
  const [isCustomModel, setIsCustomModel] = useState(false);
  const [customModel, setCustomModel] = useState('');
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

  // 从 AuthContext 加载 AI 配置
  useEffect(() => {
    setEditConfig({
      api_key: aiSettings.api_key,
      base_url: aiSettings.base_url,
      model: aiSettings.model,
    });
    // 检查是否是自定义模型
    const isPreset = MODEL_PRESETS.some((p) => p.value === aiSettings.model);
    if (!isPreset && aiSettings.model) {
      setIsCustomModel(true);
      setCustomModel(aiSettings.model);
    }

    fetchQuestionCount();
  }, [aiSettings]);

  const fetchQuestionCount = async () => {
    setIsLoadingCount(true);
    try {
      // 添加时间戳参数强制绕过 Vercel 边缘缓存
      const timestamp = Date.now();
      const res = await fetch(`/api/quiz/progress?t=${timestamp}&_=${Math.random()}`, {
        credentials: 'include',
        cache: 'no-store', // 禁用浏览器和 Vercel 缓存
        headers: {
          'Cache-Control': 'no-cache',
        },
      });
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
  const handleConfigChange = (field: string, value: string) => {
    setEditConfig((prev) => ({ ...prev, [field]: value }));
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

  const handleSaveConfig = async () => {
    const finalConfig = {
      api_key: editConfig.api_key,
      base_url: editConfig.base_url,
      model: isCustomModel ? customModel : editConfig.model,
      verified: false, // 修改后需要重新验证
    };

    const result = await updateAISettings(finalConfig);
    if (!result.error) {
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2000);
    }
  };

  // 测试 AI 连接
  const handleTestAI = async () => {
    setIsTesting(true);
    setTestResult(null);

    const finalConfig = {
      api_key: editConfig.api_key,
      base_url: editConfig.base_url,
      model: isCustomModel ? customModel : editConfig.model,
    };

    try {
      const res = await fetch('/api/settings/test-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ai_config: finalConfig }),
      });

      const data = await res.json();

      if (data.success) {
        setTestResult({ success: true, message: data.message });
        // 测试成功同时保存配置（标记为已验证）
        await updateAISettings({
          ...finalConfig,
          verified: true,
        });
      } else {
        setTestResult({ success: false, message: data.error || '测试失败' });
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

    setImportProgress({
      status: 'uploading',
      message: `正在解析 ${file.name}...`,
      totalQuestions: 0,
      parsedQuestions: 0,
      savedQuestions: 0,
      currentBatch: 0,
      totalBatches: 0,
      errors: [],
    });

    try {
      // Step 1: 客户端 PDF 文本提取
      const extractResult = await extractQuestionsFromPDF(file, (msg) => {
        setImportProgress((prev) => ({ ...prev, message: msg }));
      });

      const { locallyParsed, unparsedQuestions, rawQuestions } = extractResult;

      if (rawQuestions.length === 0) {
        throw new Error('PDF 中未找到任何题目，请确认 PDF 包含 CISSP 考试题目');
      }

      // Step 2: AI 辅助解析
      let allParsedQuestions: any[] = [...locallyParsed];
      const errors: string[] = [];

      setImportProgress((prev) => ({
        ...prev,
        status: 'parsing',
        totalQuestions: rawQuestions.length,
        parsedQuestions: locallyParsed.length,
        message: locallyParsed.length > 0
          ? `本地解析成功 ${locallyParsed.length} 题${unparsedQuestions.length > 0 ? `，${unparsedQuestions.length} 题需要 AI 辅助` : ''}`
          : `准备 AI 解析 ${unparsedQuestions.length} 道题目...`,
      }));

      if (unparsedQuestions.length > 0) {
        const BATCH_SIZE = 15;
        const totalBatches = Math.ceil(unparsedQuestions.length / BATCH_SIZE);

        setImportProgress((prev) => ({
          ...prev,
          totalBatches,
          message: `AI 正在解析剩余 ${unparsedQuestions.length} 题 (${totalBatches} 批)...`,
        }));

        // 使用当前用户的 AI 配置
        const currentAIConfig = {
          api_key: editConfig.api_key,
          base_url: editConfig.base_url,
          model: isCustomModel ? customModel : editConfig.model,
        };

        for (let i = 0; i < unparsedQuestions.length; i += BATCH_SIZE) {
          const batch = unparsedQuestions.slice(i, i + BATCH_SIZE);
          const batchIndex = Math.floor(i / BATCH_SIZE);

          setImportProgress((prev) => ({
            ...prev,
            currentBatch: batchIndex + 1,
            message: `AI 解析第 ${batchIndex + 1}/${totalBatches} 批...`,
          }));

          try {
            const parseRes = await fetch('/api/import/parse', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                ai_config: currentAIConfig,
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
              errors.push(`AI 批次 ${batchIndex + 1}: ${errData.error}`);
            }
          } catch (batchErr: any) {
            errors.push(`AI 批次 ${batchIndex + 1}: ${batchErr.message}`);
          }

          if (i + BATCH_SIZE < unparsedQuestions.length) {
            await new Promise((r) => setTimeout(r, 1500));
          }
        }
      }

      if (allParsedQuestions.length === 0) {
        throw new Error('未能解析出任何题目，请检查 PDF 内容格式');
      }

      // Step 3: 保存到数据库
      setImportProgress((prev) => ({
        ...prev,
        status: 'saving',
        message: `正在保存 ${allParsedQuestions.length} 道题目到数据库...`,
        errors,
      }));

      const SAVE_BATCH = 50;
      let totalSaved = 0;
      const totalSaveBatches = Math.ceil(allParsedQuestions.length / SAVE_BATCH);

      for (let i = 0; i < allParsedQuestions.length; i += SAVE_BATCH) {
        const batch = allParsedQuestions.slice(i, i + SAVE_BATCH);
        const saveBatchIdx = Math.floor(i / SAVE_BATCH) + 1;

        setImportProgress((prev) => ({
          ...prev,
          message: `正在保存到数据库 (${saveBatchIdx}/${totalSaveBatches})...`,
        }));

        try {
          const saveRes = await fetch('/api/import/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
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

      setImportProgress({
        status: 'completed',
        message: `导入完成！成功保存 ${totalSaved} 道题目`,
        totalQuestions: rawQuestions.length,
        parsedQuestions: allParsedQuestions.length,
        savedQuestions: totalSaved,
        currentBatch: 0,
        totalBatches: 0,
        errors,
      });

      fetchQuestionCount();
    } catch (err: any) {
      setImportProgress((prev) => ({
        ...prev,
        status: 'error',
        message: err.message || '导入失败',
      }));
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // 清空题库
  const handleClearQuestions = async () => {
    setIsClearing(true);
    try {
      const res = await fetch('/api/import/clear', { method: 'DELETE', credentials: 'include' });
      if (res.ok) {
        setQuestionCount(0);
        setShowClearConfirm(false);
        setImportProgress({
          status: 'idle', message: '', totalQuestions: 0,
          parsedQuestions: 0, savedQuestions: 0, currentBatch: 0,
          totalBatches: 0, errors: [],
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

  const isImporting = ['uploading', 'splitting', 'parsing', 'saving'].includes(importProgress.status);
  const canImport = isAdmin && aiSettings.verified && !isImporting;

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2 sm:gap-3">
          <Settings className="text-gray-500" />
          设置
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          配置 AI 模型{isAdmin ? '并管理题库' : ''}
        </p>
      </div>

      {/* ═══════════════════ AI 配置 ═══════════════════ */}
      <div className="bg-white dark:bg-gray-900 rounded-xl sm:rounded-2xl shadow-lg border border-gray-100 dark:border-gray-800 p-4 sm:p-6">
        <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
          <Brain size={20} className="text-purple-500" />
          AI 模型配置
        </h3>
        <p className="text-xs text-gray-400 mb-4">
          每个用户独立配置，用于 AI 解析和名词速查功能
        </p>

        <div className="space-y-4">
          {/* API Key */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              API Key
            </label>
            <input
              type="password"
              value={editConfig.api_key}
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
              value={editConfig.base_url}
              onChange={(e) => handleConfigChange('base_url', e.target.value)}
              placeholder="https://api.openai.com/v1"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
            />
          </div>

          {/* 模型选择 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              模型
            </label>
            <select
              value={isCustomModel ? 'custom' : editConfig.model}
              onChange={(e) => handleModelChange(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
            >
              {MODEL_PRESETS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
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
            disabled={isTesting || !editConfig.api_key}
            className={clsx(
              'flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm transition-all',
              isTesting || !editConfig.api_key
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

          {aiSettings.verified && (
            <span className="ml-auto flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 font-medium">
              <CheckCircle size={14} />
              AI 已验证
            </span>
          )}
        </div>
      </div>

      {/* ═══════════════════ PDF 导入（仅管理员） ═══════════════════ */}
      {isAdmin ? (
        <div className="bg-white dark:bg-gray-900 rounded-xl sm:rounded-2xl shadow-lg border border-gray-100 dark:border-gray-800 p-4 sm:p-6">
          <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
            <FileText size={20} className="text-blue-500" />
            PDF 题库导入
            <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-medium">
              管理员
            </span>
          </h3>

          {!aiSettings.verified && (
            <div className="mb-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 text-sm flex items-start gap-2">
              <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">请先配置并验证 AI 连接</p>
                <p className="text-xs mt-0.5 opacity-75">
                  PDF 导入需要 AI 模型支持
                </p>
              </div>
            </div>
          )}

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
            <Upload size={32} className={canImport ? 'text-blue-500' : 'text-gray-400'} />
            <div className="text-center">
              <p className={clsx('font-medium text-sm', canImport ? 'text-blue-700 dark:text-blue-300' : 'text-gray-400')}>
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
                        width: `${importProgress.totalBatches > 0
                          ? (importProgress.currentBatch / importProgress.totalBatches) * 100
                          : 0}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {(importProgress.parsedQuestions > 0 || importProgress.savedQuestions > 0) && (
                <div className="flex gap-4 text-xs">
                  <span className="text-gray-500">AI 解析: {importProgress.parsedQuestions} 题</span>
                  <span className="text-gray-500">已保存: {importProgress.savedQuestions} 题</span>
                </div>
              )}

              {importProgress.status === 'completed' && (
                <div className="p-3 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 text-sm flex items-start gap-2">
                  <CheckCircle size={18} className="flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">{importProgress.message}</p>
                    {importProgress.errors.length > 0 && (
                      <div className="mt-2 text-xs text-amber-600">
                        <p>{importProgress.errors.length} 个警告:</p>
                        {importProgress.errors.slice(0, 3).map((e, i) => (
                          <p key={i} className="mt-0.5">• {e}</p>
                        ))}
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
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-xl sm:rounded-2xl shadow-lg border border-gray-100 dark:border-gray-800 p-4 sm:p-6">
          <div className="flex items-center gap-3 text-gray-400">
            <ShieldAlert size={20} />
            <p className="text-sm">题库导入仅限管理员操作，请联系管理员</p>
          </div>
        </div>
      )}

      {/* ═══════════════════ 题库管理 ═══════════════════ */}
      <div className="bg-white dark:bg-gray-900 rounded-xl sm:rounded-2xl shadow-lg border border-gray-100 dark:border-gray-800 p-4 sm:p-6">
        <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
          <Database size={20} className="text-green-500" />
          题库管理
        </h3>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="text-center">
              <p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
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

          {/* 清空按钮仅管理员可见 */}
          {isAdmin && (
            <div>
              {!showClearConfirm ? (
                <button
                  onClick={() => setShowClearConfirm(true)}
                  disabled={questionCount === 0 || questionCount === null || isClearing}
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
                    {isClearing ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
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
          )}
        </div>
      </div>

      {/* 说明 */}
      <div className="text-xs text-center text-gray-400 space-y-1">
        <p>
          AI 配置存储在服务端数据库，每个用户独立管理
        </p>
        <p>
          题库由管理员统一导入，所有用户共享
        </p>
      </div>
    </div>
  );
}
