'use client';

import { AIExplanation as AIExplanationType } from '@/types/database';
import { Brain, MapPin, Tag, Loader2 } from 'lucide-react';

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
            AI 正在生成精简解析...
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
          AI解析（独立判断）
        </h3>
      </div>

      <div className="p-6 space-y-6">
        {/* AI 判定答案 */}
        {explanation.ai_answer && (
          <section className="p-4 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800">
            <h4 className="font-semibold text-indigo-800 dark:text-indigo-200 text-sm mb-2">
              🤖 AI判定正确选项
            </h4>
            <div className="inline-flex items-center px-3 py-1 rounded-full bg-indigo-600 text-white text-sm font-bold">
              {explanation.ai_answer}
            </div>
          </section>
        )}

        {/* 一句话总结 */}
        {(explanation.quick_takeaway || explanation.deep_analysis) && (
          <section className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <Brain size={20} className="text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h4 className="font-semibold text-gray-800 dark:text-gray-200 text-sm">
                结论
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 leading-relaxed whitespace-pre-line">
                {explanation.quick_takeaway || explanation.deep_analysis}
              </p>
            </div>
          </section>
        )}

        {/* 各选项简评 */}
        {explanation.option_briefs && explanation.option_briefs.length > 0 && (
          <section>
            <h4 className="font-semibold text-gray-800 dark:text-gray-200 text-sm mb-3">
              选项判断（精简）
            </h4>
            <div className="space-y-2">
              {explanation.option_briefs.map((item, idx) => (
                <div
                  key={`${item.option}-${idx}`}
                  className={`p-3 rounded-lg border text-sm ${
                    item.verdict === 'correct'
                      ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800 text-green-800 dark:text-green-200'
                      : 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
                  }`}
                >
                  <span className="font-bold mr-2">{item.option}</span>
                  <span>{item.reason}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 兼容旧字段 */}
        {!explanation.option_briefs?.length && explanation.correct_reasoning && (
          <section className="p-4 rounded-xl bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800">
            <h4 className="font-semibold text-green-800 dark:text-green-200 text-sm mb-2">
              ✅ 正确选项说明
            </h4>
            <p className="text-sm text-green-700 dark:text-green-300 leading-relaxed whitespace-pre-line">
              {explanation.correct_reasoning}
            </p>
          </section>
        )}

        {!explanation.option_briefs?.length && explanation.wrong_reasoning && (
          <section className="p-4 rounded-xl bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800">
            <h4 className="font-semibold text-red-800 dark:text-red-200 text-sm mb-2">
              ❌ 其他选项说明
            </h4>
            <p className="text-sm text-red-700 dark:text-red-300 leading-relaxed whitespace-pre-line">
              {explanation.wrong_reasoning}
            </p>
          </section>
        )}

        {/* CISSP 知识点 */}
        {(explanation.cissp_knowledge_point || explanation.domain_mapping) && (
          <section className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <MapPin size={20} className="text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h4 className="font-semibold text-gray-800 dark:text-gray-200 text-sm">
                CISSP知识点
              </h4>
              {explanation.cissp_knowledge_point && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {explanation.cissp_knowledge_point}
                </p>
              )}
              {explanation.domain_mapping && (
                <p className="text-sm text-indigo-600 dark:text-indigo-400 mt-1">
                  Domain {explanation.domain_mapping.domain_id} {explanation.domain_mapping.domain_name}
                  {explanation.domain_mapping.sub_topic ? ` · ${explanation.domain_mapping.sub_topic}` : ''}
                </p>
              )}
            </div>
          </section>
        )}

        {/* 域映射 */}
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
