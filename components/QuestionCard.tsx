'use client';

import { useState } from 'react';
import { Question } from '@/types/database';
import { CheckCircle, XCircle, Lightbulb } from 'lucide-react';
import clsx from 'clsx';

interface QuestionCardProps {
  question: Question;
  questionIndex: number;
  totalQuestions: number;
  mode: 'practice' | 'exam';
  onSubmit: (answer: string) => void;
  onRequestExplanation: () => void;
  result?: {
    is_correct: boolean;
    correct_answer: string;
    explanation: string;
    keywords: string[];
  } | null;
  showResult: boolean;
}

// 高亮题眼关键词
function highlightKeywords(text: string, keywords: string[]): React.ReactNode {
  if (!keywords || keywords.length === 0) return text;

  const pattern = new RegExp(
    `\\b(${keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
    'gi'
  );

  const parts = text.split(pattern);
  return parts.map((part, i) => {
    const isHighlight = keywords.some(
      (k) => k.toLowerCase() === part.toLowerCase()
    );
    if (isHighlight) {
      return (
        <span
          key={i}
          className="bg-yellow-200 dark:bg-yellow-800 text-yellow-900 dark:text-yellow-100 font-bold px-1 rounded"
        >
          {part}
        </span>
      );
    }
    return part;
  });
}

export default function QuestionCard({
  question,
  questionIndex,
  totalQuestions,
  mode,
  onSubmit,
  onRequestExplanation,
  result,
  showResult,
}: QuestionCardProps) {
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSelect = (label: string) => {
    if (isSubmitted && mode === 'practice') return;
    setSelectedAnswer(label);
  };

  const handleSubmit = () => {
    if (!selectedAnswer) return;
    setIsSubmitted(true);
    onSubmit(selectedAnswer);
  };

  const getOptionStyle = (label: string) => {
    if (!showResult || !result) {
      return selectedAnswer === label
        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
        : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 hover:bg-gray-50 dark:hover:bg-gray-800';
    }

    // 显示结果
    if (label === result.correct_answer) {
      return 'border-green-500 bg-green-50 dark:bg-green-900/30';
    }
    if (label === selectedAnswer && !result.is_correct) {
      return 'border-red-500 bg-red-50 dark:bg-red-900/30';
    }
    return 'border-gray-200 dark:border-gray-700 opacity-60';
  };

  const allKeywords = [
    ...(question.keywords || []),
    'MOST', 'LEAST', 'FIRST', 'PRIMARY', 'BEST', 'MAIN',
    'NOT', 'EXCEPT', 'INITIAL', 'LAST',
  ];

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-800 overflow-hidden">
      {/* 顶部进度 */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-3 flex items-center justify-between">
        <span className="text-white text-sm font-medium">
          题目 {questionIndex + 1} / {totalQuestions}
        </span>
        <span className="text-white/80 text-xs px-2 py-1 rounded-full bg-white/20">
          {mode === 'exam' ? '模拟考试' : '练习模式'}
        </span>
      </div>

      {/* 进度条 */}
      <div className="h-1 bg-gray-200 dark:bg-gray-800">
        <div
          className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-500"
          style={{ width: `${((questionIndex + 1) / totalQuestions) * 100}%` }}
        />
      </div>

      {/* 题干 */}
      <div className="p-6">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-xs font-medium px-2 py-1 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300">
            Domain {question.domain}
          </span>
          <span className="text-xs text-gray-500">
            #{question.question_number}
          </span>
        </div>

        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 leading-relaxed mb-6">
          {highlightKeywords(question.question_text, allKeywords)}
        </h2>

        {/* 选项 */}
        <div className="space-y-3">
          {question.options.map((option) => (
            <button
              key={option.label}
              onClick={() => handleSelect(option.label)}
              disabled={isSubmitted && mode === 'practice'}
              className={clsx(
                'w-full text-left p-4 rounded-xl border-2 transition-all duration-200',
                'flex items-start gap-3',
                getOptionStyle(option.label)
              )}
            >
              <span
                className={clsx(
                  'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold',
                  selectedAnswer === option.label
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                )}
              >
                {option.label}
              </span>
              <span className="text-gray-700 dark:text-gray-300 pt-1">
                {option.text}
              </span>
              {showResult && result && option.label === result.correct_answer && (
                <CheckCircle className="flex-shrink-0 ml-auto text-green-500 mt-1" size={20} />
              )}
              {showResult &&
                result &&
                option.label === selectedAnswer &&
                !result.is_correct && (
                  <XCircle className="flex-shrink-0 ml-auto text-red-500 mt-1" size={20} />
                )}
            </button>
          ))}
        </div>

        {/* 操作按钮 */}
        <div className="mt-6 flex items-center gap-3">
          {!isSubmitted ? (
            <button
              onClick={handleSubmit}
              disabled={!selectedAnswer}
              className={clsx(
                'px-6 py-3 rounded-xl font-medium transition-all duration-200',
                selectedAnswer
                  ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/25'
                  : 'bg-gray-200 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
              )}
            >
              提交答案
            </button>
          ) : (
            showResult &&
            result && (
              <div className="flex items-center gap-3 w-full">
                <div
                  className={clsx(
                    'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium',
                    result.is_correct
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                      : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                  )}
                >
                  {result.is_correct ? (
                    <>
                      <CheckCircle size={18} /> 回答正确！
                    </>
                  ) : (
                    <>
                      <XCircle size={18} /> 回答错误，正确答案是 {result.correct_answer}
                    </>
                  )}
                </div>
                <button
                  onClick={onRequestExplanation}
                  className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-800/30 transition-colors text-sm font-medium"
                >
                  <Lightbulb size={18} />
                  AI 深度解析
                </button>
              </div>
            )
          )}
        </div>

        {/* 基础解析（练习模式提交后显示） */}
        {showResult && result && result.explanation && (
          <div className="mt-4 p-4 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              📝 基础解析
            </h4>
            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
              {result.explanation}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
