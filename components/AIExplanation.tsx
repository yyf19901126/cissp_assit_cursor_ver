'use client';

import { AIExplanation as AIExplanationType } from '@/types/database';
import { Brain, MapPin, BookOpen, UserCheck, Tag, Loader2 } from 'lucide-react';

interface AIExplanationProps {
  explanation: AIExplanationType | null;
  isLoading: boolean;
}

export default function AIExplanationPanel({
  explanation,
  isLoading,
}: AIExplanationProps) {
  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-800 p-8">
        <div className="flex flex-col items-center justify-center gap-4">
          <Loader2 className="animate-spin text-indigo-500" size={40} />
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            AI 正在深度分析这道题...
          </p>
        </div>
      </div>
    );
  }

  if (!explanation) return null;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-800 overflow-hidden">
      <div className="bg-gradient-to-r from-purple-600 to-pink-600 px-6 py-4">
        <h3 className="text-white font-bold flex items-center gap-2">
          <Brain size={20} />
          AI 深度解析
        </h3>
      </div>

      <div className="p-6 space-y-6">
        {/* 域映射 */}
        {explanation.domain_mapping && (
          <section className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <MapPin size={20} className="text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h4 className="font-semibold text-gray-800 dark:text-gray-200 text-sm">
                知识域定位
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                <span className="inline-block px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-xs font-medium mr-2">
                  Domain {explanation.domain_mapping.domain_id}
                </span>
                {explanation.domain_mapping.domain_name}
              </p>
              <p className="text-sm text-indigo-600 dark:text-indigo-400 mt-1">
                → {explanation.domain_mapping.sub_topic}
              </p>
            </div>
          </section>
        )}

        {/* 深度解析 */}
        {explanation.deep_analysis && (
          <section className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <Brain size={20} className="text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h4 className="font-semibold text-gray-800 dark:text-gray-200 text-sm">
                深度解析
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 leading-relaxed whitespace-pre-line">
                {explanation.deep_analysis}
              </p>
            </div>
          </section>
        )}

        {/* 管理思维 */}
        {explanation.manager_perspective && (
          <section className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800">
            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <UserCheck size={20} className="text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h4 className="font-semibold text-amber-800 dark:text-amber-200 text-sm">
                🎯 管理思维视角
              </h4>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-1 leading-relaxed italic whitespace-pre-line">
                &ldquo;如果你是管理层，为什么选这个？&rdquo;
              </p>
              <p className="text-sm text-gray-700 dark:text-gray-300 mt-2 leading-relaxed whitespace-pre-line">
                {explanation.manager_perspective}
              </p>
            </div>
          </section>
        )}

        {/* CBK 参考 */}
        {explanation.cbk_reference && (
          <section className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <BookOpen size={20} className="text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h4 className="font-semibold text-gray-800 dark:text-gray-200 text-sm">
                📚 CBK / 官方教材参考
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 leading-relaxed whitespace-pre-line">
                {explanation.cbk_reference}
              </p>
            </div>
          </section>
        )}

        {/* 正确推理 */}
        {explanation.correct_reasoning && (
          <section className="p-4 rounded-xl bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800">
            <h4 className="font-semibold text-green-800 dark:text-green-200 text-sm mb-2">
              ✅ 正确答案推理
            </h4>
            <p className="text-sm text-green-700 dark:text-green-300 leading-relaxed whitespace-pre-line">
              {explanation.correct_reasoning}
            </p>
          </section>
        )}

        {/* 错误分析 */}
        {explanation.wrong_reasoning && (
          <section className="p-4 rounded-xl bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800">
            <h4 className="font-semibold text-red-800 dark:text-red-200 text-sm mb-2">
              ❌ 错误选项分析
            </h4>
            <p className="text-sm text-red-700 dark:text-red-300 leading-relaxed whitespace-pre-line">
              {explanation.wrong_reasoning}
            </p>
          </section>
        )}

        {/* 题眼关键词 */}
        {explanation.key_highlights && explanation.key_highlights.length > 0 && (
          <section className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
              <Tag size={20} className="text-yellow-600 dark:text-yellow-400" />
            </div>
            <div>
              <h4 className="font-semibold text-gray-800 dark:text-gray-200 text-sm mb-2">
                🔑 题眼关键词
              </h4>
              <div className="flex flex-wrap gap-2">
                {explanation.key_highlights.map((keyword, i) => (
                  <span
                    key={i}
                    className="px-3 py-1 rounded-full bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 text-xs font-bold"
                  >
                    {keyword}
                  </span>
                ))}
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
