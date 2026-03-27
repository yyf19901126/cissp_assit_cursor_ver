'use client';

import { useState, useEffect, useCallback } from 'react';
import { Question, QuestionOption } from '@/types/database';
import { X, Wand2, Loader2, Save, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';

export interface QuestionRepairAssistantProps {
  open: boolean;
  question: Question | null;
  onClose: () => void;
  /** 保存成功后返回最新题目；total_available 为当前可用题库总数 */
  onSaved: (q: Question, meta?: { total_available: number | null }) => void;
  aiSettings: { api_key: string; base_url: string; model: string };
}

const LABELS = ['A', 'B', 'C', 'D'] as const;

function sortOptions(opts: QuestionOption[]): QuestionOption[] {
  return [...opts].sort((a, b) => a.label.localeCompare(b.label));
}

export default function QuestionRepairAssistant({
  open,
  question,
  onClose,
  onSaved,
  aiSettings,
}: QuestionRepairAssistantProps) {
  const [questionText, setQuestionText] = useState('');
  const [optionTexts, setOptionTexts] = useState<Record<string, string>>({
    A: '',
    B: '',
    C: '',
    D: '',
  });
  const [correctAnswer, setCorrectAnswer] = useState<string>('A');
  const [markUnavailable, setMarkUnavailable] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState<string | null>(null);

  const resetFromQuestion = useCallback((q: Question) => {
    setQuestionText(q.question_text);
    const sorted = sortOptions(q.options);
    const next: Record<string, string> = { A: '', B: '', C: '', D: '' };
    sorted.forEach((o) => {
      next[o.label.toUpperCase()] = o.text;
    });
    setOptionTexts(next);
    setCorrectAnswer((q.correct_answer || 'A').toUpperCase());
    setMarkUnavailable(q.is_available === false);
    setError(null);
    setSaveOk(null);
  }, []);

  useEffect(() => {
    if (open && question) {
      resetFromQuestion(question);
    }
  }, [open, question, resetFromQuestion]);

  const runAiRepair = async () => {
    if (!question) return;
    setError(null);
    setSaveOk(null);
    setIsAiLoading(true);
    try {
      const opts: QuestionOption[] = LABELS.map((l) => ({
        label: l,
        text: optionTexts[l] || '',
      }));
      const aiConfig = aiSettings.api_key
        ? {
            api_key: aiSettings.api_key,
            base_url: aiSettings.base_url,
            model: aiSettings.model,
          }
        : undefined;
      const res = await fetch('/api/ai/repair-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          question_text: questionText,
          options: opts,
          domain_id: question.domain,
          ai_config: aiConfig,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'AI 修复失败');
        return;
      }
      if (data.question_text) {
        setQuestionText(String(data.question_text));
      }
      if (Array.isArray(data.options)) {
        const next = { ...optionTexts };
        for (const o of data.options) {
          const lab = String(o.label || '').toUpperCase();
          if (LABELS.includes(lab as (typeof LABELS)[number])) {
            next[lab] = String(o.text ?? '');
          }
        }
        setOptionTexts(next);
      }
      setSaveOk('已根据 AI 建议更新编辑区，请核对后再保存。');
    } catch (e: any) {
      setError(e.message || '网络错误');
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleSave = async () => {
    if (!question) return;
    setError(null);
    setSaveOk(null);
    const opts: QuestionOption[] = LABELS.map((l) => ({
      label: l,
      text: (optionTexts[l] || '').trim(),
    }));
    if (opts.some((o) => !o.text)) {
      setError('四个选项的文字都不能为空');
      return;
    }
    if (!questionText.trim()) {
      setError('题干不能为空');
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch(`/api/quiz/questions/${question.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          question_text: questionText.trim(),
          options: opts,
          correct_answer: correctAnswer,
          is_available: !markUnavailable,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || '保存失败');
        return;
      }
      if (data.question) {
        onSaved(data.question as Question, {
          total_available: data.total_available ?? null,
        });
        setSaveOk('已保存到题库');
      }
    } catch (e: any) {
      setError(e.message || '网络错误');
    } finally {
      setIsSaving(false);
    }
  };

  if (!open || !question) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="关闭"
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-2xl max-h-[92vh] overflow-y-auto bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800"
        role="dialog"
        aria-labelledby="repair-title"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-white/95 dark:bg-gray-900/95 backdrop-blur">
          <h2 id="repair-title" className="text-lg font-bold text-gray-900 dark:text-white">
            题目修复助手
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="关闭"
          >
            <X size={22} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            题号 #{question.question_number} · Domain {question.domain} · 可修正 OCR
            识别错误、更正正确答案，或将本题标记为不可用（仍保留在库中）。
          </p>

          {error && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300 flex gap-2">
              <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}
          {saveOk && (
            <div className="p-3 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-sm text-green-800 dark:text-green-200">
              {saveOk}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              题干
            </label>
            <textarea
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              rows={5}
              className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 p-3 text-sm font-mono leading-relaxed"
            />
          </div>

          <div className="space-y-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">选项</span>
            {LABELS.map((label) => (
              <div key={label} className="flex gap-2 items-start">
                <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-bold text-sm flex items-center justify-center mt-1">
                  {label}
                </span>
                <textarea
                  value={optionTexts[label] || ''}
                  onChange={(e) =>
                    setOptionTexts((prev) => ({ ...prev, [label]: e.target.value }))
                  }
                  rows={2}
                  className="flex-1 min-w-0 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 p-2 text-sm"
                />
              </div>
            ))}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              正确答案
            </label>
            <select
              value={correctAnswer}
              onChange={(e) => setCorrectAnswer(e.target.value)}
              className="w-full sm:w-48 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 p-2 text-sm"
            >
              {LABELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-start gap-3 p-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-900/10 cursor-pointer">
            <input
              type="checkbox"
              checked={markUnavailable}
              onChange={(e) => setMarkUnavailable(e.target.checked)}
              className="mt-1 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
            />
            <span className="text-sm text-amber-900 dark:text-amber-200">
              <span className="font-semibold">标记为不可用</span>
              <span className="block text-amber-800/90 dark:text-amber-300/90 mt-0.5">
                开启后本题不会出现在随机练习、考试、顺序刷题与错题重做中，题库可用总数会减少；可在「已停用题目」中查看与恢复。
              </span>
            </span>
          </label>

          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <button
              type="button"
              onClick={runAiRepair}
              disabled={isAiLoading}
              className={clsx(
                'flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm',
                'bg-violet-100 dark:bg-violet-900/30 text-violet-800 dark:text-violet-200',
                'hover:bg-violet-200 dark:hover:bg-violet-800/40 disabled:opacity-50'
              )}
            >
              {isAiLoading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Wand2 size={18} />
              )}
              AI 辅助修复 OCR
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className={clsx(
                'flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm',
                'bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 sm:ml-auto'
              )}
            >
              {isSaving ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Save size={18} />
              )}
              确认保存到题库
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
