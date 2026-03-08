'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface NavigationMatrixProps {
  totalQuestions: number;
  currentIndex: number;
  answers: Record<string, string>;
  questionIds: string[];
  results?: Record<string, boolean>; // question_id -> is_correct
  onNavigate: (index: number) => void;
}

export default function NavigationMatrix({
  totalQuestions,
  currentIndex,
  answers,
  questionIds,
  results,
  onNavigate,
}: NavigationMatrixProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-800 p-4">
      {/* 标题栏（可点击折叠/展开） */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between mb-3 hover:opacity-80 transition-opacity"
      >
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          📋 题目导航
        </h3>
        {isExpanded ? (
          <ChevronUp size={18} className="text-gray-500" />
        ) : (
          <ChevronDown size={18} className="text-gray-500" />
        )}
      </button>

      {/* 折叠时显示当前题号 */}
      {!isExpanded && (
        <div className="text-xs text-gray-500 dark:text-gray-400 text-center py-2">
          当前：第 {currentIndex + 1} 题 / 共 {totalQuestions} 题
        </div>
      )}

      {/* 展开时显示完整导航 */}
      {isExpanded && (
        <>
          <div className="grid grid-cols-10 gap-1.5 max-h-96 overflow-y-auto">
            {Array.from({ length: totalQuestions }, (_, i) => {
              const qId = questionIds[i];
              const isAnswered = qId && answers[qId];
              const isCurrent = i === currentIndex;
              const isCorrect = results && qId ? results[qId] : undefined;

              return (
                <button
                  key={i}
                  onClick={() => onNavigate(i)}
                  className={clsx(
                    'w-8 h-8 rounded-lg text-xs font-medium transition-all duration-150',
                    'flex items-center justify-center',
                    isCurrent
                      ? 'ring-2 ring-blue-500 ring-offset-1 bg-blue-500 text-white'
                      : isCorrect === true
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                      : isCorrect === false
                      ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                      : isAnswered
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200'
                  )}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>

          {/* 图例 */}
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-blue-500" />
              <span>当前题</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-green-100 dark:bg-green-900/30" />
              <span>正确</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-red-100 dark:bg-red-900/30" />
              <span>错误</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-blue-100 dark:bg-blue-900/30" />
              <span>已答</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-gray-100 dark:bg-gray-800" />
              <span>未答</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
