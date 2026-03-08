'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import QuestionCard from '@/components/QuestionCard';
import NavigationMatrix from '@/components/NavigationMatrix';
import AIExplanationPanel from '@/components/AIExplanation';
import TermLookup from '@/components/TermLookup';
import { Question, AIExplanation } from '@/types/database';
import { CISSP_DOMAINS } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
import {
  getSequentialProgress,
  saveSequentialProgress,
  clearSequentialProgress,
} from '@/lib/sequential-progress';
import {
  Timer,
  ChevronLeft,
  ChevronRight,
  Trophy,
  Loader2,
  Database,
  BookOpen,
  ListOrdered,
  Shuffle,
  Target,
  Play,
  RotateCcw,
  ArrowRight,
} from 'lucide-react';
import clsx from 'clsx';

type QuizMode = 'practice' | 'exam' | 'sequential';

function QuizContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, aiSettings } = useAuth();

  const modeParam = searchParams.get('mode') || 'practice';
  const domainParam = searchParams.get('domain');

  // ═══════════════════ 状态 ═══════════════════
  const [mode, setMode] = useState<QuizMode>(modeParam as QuizMode);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<
    Record<string, { is_correct: boolean; correct_answer: string; explanation: string; keywords: string[] }>
  >({});
  const [aiExplanation, setAiExplanation] = useState<AIExplanation | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isStarted, setIsStarted] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);

  // 多域选择
  const [selectedDomains, setSelectedDomains] = useState<number[]>(
    domainParam ? [parseInt(domainParam)] : []
  );

  // 自定义题目数量
  const [customQuestionCount, setCustomQuestionCount] = useState(25);

  // 顺序模式
  const [sequentialProgress, setSequentialProgressState] = useState(
    user ? getSequentialProgress(user.id) : null
  );
  const [hasMoreQuestions, setHasMoreQuestions] = useState(false);
  const [sequentialGrandTotal, setSequentialGrandTotal] = useState(0);
  const [sequentialStartFrom, setSequentialStartFrom] = useState(0);
  const [sequentialBatchSize, setSequentialBatchSize] = useState(25);

  // 追踪用户选中但未提交的答案（用于导航时自动提交）
  const pendingAnswerRef = useRef<{ questionId: string; answer: string } | null>(null);

  // ═══════════════════ 计时器 ═══════════════════
  useEffect(() => {
    if (mode !== 'exam' || !isStarted || isCompleted || timeRemaining === null) return;
    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev === null || prev <= 0) {
          flushPendingAnswer(); // 时间到，提交最后作答
          setIsCompleted(true);
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [mode, isStarted, isCompleted, timeRemaining]);

  // ═══════════════════ 域选择 ═══════════════════
  const toggleDomain = (domainId: number) => {
    setSelectedDomains((prev) =>
      prev.includes(domainId) ? prev.filter((d) => d !== domainId) : [...prev, domainId]
    );
  };

  const toggleAllDomains = () => {
    if (selectedDomains.length === 8) {
      setSelectedDomains([]);
    } else {
      setSelectedDomains([1, 2, 3, 4, 5, 6, 7, 8]);
    }
  };

  // 最小题目数量
  const minQuestionCount = Math.max(1, selectedDomains.length);

  // 确保自定义数量不低于最小值
  useEffect(() => {
    if (customQuestionCount < minQuestionCount) {
      setCustomQuestionCount(minQuestionCount);
    }
  }, [selectedDomains, minQuestionCount, customQuestionCount]);

  // ═══════════════════ 开始答题 ═══════════════════
  const startQuiz = useCallback(
    async (resumeFrom?: number) => {
      setIsLoadingQuestions(true);
      setLoadError(null);
      setCurrentIndex(0);
      setAnswers({});
      setResults({});
      setIsCompleted(false);
      setAiExplanation(null);

      if (mode === 'exam') {
        setTimeRemaining(180 * 60);
      }

      const startFrom = resumeFrom ?? sequentialStartFrom;

      try {
        const questionCount =
          mode === 'exam' ? 125 : mode === 'sequential' ? sequentialBatchSize : customQuestionCount;

          const res = await fetch('/api/quiz/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mode,
              // 顺序模式不需要域筛选，刷整个题库
              domains: mode === 'sequential' ? undefined : (selectedDomains.length > 0 ? selectedDomains : undefined),
              question_count: questionCount,
              start_from: mode === 'sequential' ? startFrom : undefined,
            }),
          });

        const data = await res.json();

        // 顺序模式无更多题目
        if (data.error === 'no_more_questions') {
          if (user) clearSequentialProgress(user.id);
          setSequentialProgressState(null);
          setLoadError('🎉 恭喜！所有题目已完成，进度已重置。');
          setIsLoadingQuestions(false);
          return;
        }

        if (!res.ok) {
          setLoadError(data.error || '无法创建答题会话');
          setIsLoadingQuestions(false);
          return;
        }

        const session = data.session;
        if (!session?.question_ids?.length) {
          setLoadError('题库为空，请先导入题目');
          setIsLoadingQuestions(false);
          return;
        }

        // 保存顺序模式元数据
        if (mode === 'sequential') {
          setHasMoreQuestions(data.has_more);
          setSequentialGrandTotal(data.grand_total);
        }

        // 批量获取题目详情
        const qRes = await fetch('/api/quiz/questions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question_ids: session.question_ids }),
        });

        let loadedQuestions: Question[] = [];
        if (qRes.ok) {
          const qData = await qRes.json();
          loadedQuestions = qData.questions || [];
        }

        if (loadedQuestions.length === 0) {
          setLoadError('无法加载题目数据');
          setIsLoadingQuestions(false);
          return;
        }

        setQuestions(loadedQuestions);
        setIsStarted(true);
      } catch (err: any) {
        setLoadError(`网络错误: ${err.message || '请检查网络连接'}`);
      } finally {
        setIsLoadingQuestions(false);
      }
    },
    [mode, selectedDomains, customQuestionCount, sequentialStartFrom, sequentialBatchSize]
  );

  // ═══════════════════ 提交答案 ═══════════════════
  const handleSubmitAnswer = async (answer: string, questionOverride?: Question) => {
    const question = questionOverride || questions[currentIndex];
    if (!question) return;

    // 清除 pending 状态（已提交）
    if (pendingAnswerRef.current?.questionId === question.id) {
      pendingAnswerRef.current = null;
    }

    // 如果已经提交过相同答案，跳过重复提交
    if (answers[question.id] === answer && results[question.id]) {
      return;
    }

    setAnswers((prev) => ({ ...prev, [question.id]: answer }));

    try {
      const res = await fetch('/api/quiz/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question_id: question.id,
          user_answer: answer,
          mode: mode === 'sequential' ? 'practice' : mode,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setResults((prev) => ({ ...prev, [question.id]: data }));

        // 顺序模式：保存进度
        if (mode === 'sequential' && user) {
          const progress = getSequentialProgress(user.id);
          saveSequentialProgress(user.id, {
            lastQuestionNumber: question.question_number,
            totalQuestions: sequentialGrandTotal,
            answeredCount: (progress?.answeredCount || 0) + 1,
            timestamp: new Date().toISOString(),
          });
          setSequentialProgressState(getSequentialProgress(user.id));
        }
        return;
      }
    } catch {}

    // API 失败时本地判断
    const isCorrect = answer.toUpperCase() === question.correct_answer.toUpperCase();
    setResults((prev) => ({
      ...prev,
      [question.id]: {
        is_correct: isCorrect,
        correct_answer: question.correct_answer,
        explanation: question.base_explanation,
        keywords: question.keywords,
      },
    }));
  };

  // 用户选中选项时的回调（追踪待提交的答案）
  const handleAnswerSelect = (answer: string) => {
    const question = questions[currentIndex];
    if (!question) return;
    pendingAnswerRef.current = { questionId: question.id, answer };
  };

  // 自动提交当前题目的待提交答案
  const flushPendingAnswer = () => {
    const pending = pendingAnswerRef.current;
    if (!pending) return;
    // 只提交尚未提交的答案
    if (!results[pending.questionId]) {
      const question = questions.find(q => q.id === pending.questionId);
      if (question) {
        handleSubmitAnswer(pending.answer, question);
      }
    }
    pendingAnswerRef.current = null;
  };

  // ═══════════════════ AI 解析 ═══════════════════
  const handleRequestExplanation = async () => {
    const question = questions[currentIndex];
    if (!question) return;

    setIsAiLoading(true);
    setAiExplanation(null);

    try {
      const aiConfig = aiSettings.api_key ? {
        api_key: aiSettings.api_key,
        base_url: aiSettings.base_url,
        model: aiSettings.model,
      } : undefined;
      const res = await fetch('/api/ai/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question_id: question.id,
          user_answer: answers[question.id],
          ai_config: aiConfig,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setAiExplanation(data.explanation);
      } else {
        const errData = await res.json().catch(() => ({}));
        setAiExplanation({
          deep_analysis: `AI 解析请求失败: ${errData.error || '请检查 AI 配置'}`,
          domain_mapping: {
            domain_id: question.domain,
            domain_name: CISSP_DOMAINS.find((d) => d.id === question.domain)?.name || '',
            sub_topic: '',
          },
          cbk_reference: '',
          manager_perspective: '',
          key_highlights: question.keywords || [],
          correct_reasoning: '',
          wrong_reasoning: '',
        });
      }
    } catch (err: any) {
      setAiExplanation({
        deep_analysis: `AI 连接失败: ${err.message || '请检查网络'}`,
        domain_mapping: {
          domain_id: question.domain,
          domain_name: CISSP_DOMAINS.find((d) => d.id === question.domain)?.name || '',
          sub_topic: '',
        },
        cbk_reference: '',
        manager_perspective: '',
        key_highlights: [],
        correct_reasoning: '',
        wrong_reasoning: '',
      });
    } finally {
      setIsAiLoading(false);
    }
  };

  const goToQuestion = (index: number) => {
    if (index >= 0 && index < questions.length) {
      // 导航前自动提交当前题目的未提交答案
      flushPendingAnswer();
      setCurrentIndex(index);
      setAiExplanation(null);
    }
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // ═══════════════════ 顺序模式：继续下一批 ═══════════════════
  const handleSequentialNext = () => {
    const lastQuestion = questions[questions.length - 1];
    if (lastQuestion) {
      setSequentialStartFrom(lastQuestion.question_number);
      setIsStarted(false);
      setIsCompleted(false);
      setQuestions([]);
      // 立即开始下一批
      setTimeout(() => {
        startQuiz(lastQuestion.question_number);
      }, 100);
    }
  };

  // ═══════════════════ 未开始：选择界面 ═══════════════════
  if (!isStarted) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">开始答题</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            选择模式和知识域，开始你的 CISSP 之旅
          </p>
        </div>

        {/* 错误提示 */}
        {loadError && (
          <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm flex items-start gap-3">
            <Database size={20} className="flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">{loadError}</p>
            </div>
          </div>
        )}

        {/* 模式选择 */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-800 p-6">
          <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-4">选择模式</h3>
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => setMode('practice')}
              className={clsx(
                'p-5 rounded-xl border-2 text-left transition-all',
                mode === 'practice'
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-blue-300'
              )}
            >
              <div className="flex items-center gap-2 mb-2">
                <Shuffle size={18} className="text-blue-500" />
                <h4 className="font-bold text-gray-800 dark:text-gray-200 text-sm">随机练习</h4>
              </div>
              <p className="text-xs text-gray-500">自定义题数，即时反馈</p>
            </button>

            <button
              onClick={() => setMode('exam')}
              className={clsx(
                'p-5 rounded-xl border-2 text-left transition-all',
                mode === 'exam'
                  ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-purple-300'
              )}
            >
              <div className="flex items-center gap-2 mb-2">
                <Target size={18} className="text-purple-500" />
                <h4 className="font-bold text-gray-800 dark:text-gray-200 text-sm">模拟考试</h4>
              </div>
              <p className="text-xs text-gray-500">125 题 / 180 分钟</p>
            </button>

            <button
              onClick={() => setMode('sequential')}
              className={clsx(
                'p-5 rounded-xl border-2 text-left transition-all',
                mode === 'sequential'
                  ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-green-300'
              )}
            >
              <div className="flex items-center gap-2 mb-2">
                <ListOrdered size={18} className="text-green-500" />
                <h4 className="font-bold text-gray-800 dark:text-gray-200 text-sm">顺序刷题</h4>
              </div>
              <p className="text-xs text-gray-500">按序刷完，可随时暂停</p>
            </button>
          </div>
        </div>

        {/* 域选择（仅练习模式显示） */}
        {mode === 'practice' && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-800 p-6">
            <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-4">
              选择知识域（可多选，不选 = 全部）
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {/* 全选 */}
              <button
                onClick={toggleAllDomains}
                className={clsx(
                  'col-span-2 p-3 rounded-xl border text-sm text-center transition-all font-medium',
                  selectedDomains.length === 0 || selectedDomains.length === 8
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300'
                    : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-indigo-300'
                )}
              >
                {selectedDomains.length === 8 ? '✓ 全部域（取消全选）' : '全部域'}
              </button>

              {CISSP_DOMAINS.map((d) => (
                <button
                  key={d.id}
                  onClick={() => toggleDomain(d.id)}
                  className={clsx(
                    'p-3 rounded-xl border text-sm text-left transition-all flex items-center gap-2',
                    selectedDomains.includes(d.id)
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300'
                      : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-indigo-300'
                  )}
                >
                  <span
                    className={clsx(
                      'w-5 h-5 rounded flex items-center justify-center text-xs border flex-shrink-0',
                      selectedDomains.includes(d.id)
                        ? 'bg-indigo-500 border-indigo-500 text-white'
                        : 'border-gray-300 dark:border-gray-600'
                    )}
                  >
                    {selectedDomains.includes(d.id) ? '✓' : ''}
                  </span>
                  <span>
                    <span className="font-bold">D{d.id}</span> {d.nameZh}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 自定义题目数量（仅练习模式） */}
        {mode === 'practice' && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-800 p-6">
            <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-4">自定义题目数量</h3>
            <div className="flex items-center gap-4">
              <input
                type="number"
                min={minQuestionCount}
                max={500}
                value={customQuestionCount}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || minQuestionCount;
                  setCustomQuestionCount(Math.max(minQuestionCount, Math.min(500, val)));
                }}
                className="w-24 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 text-center font-bold text-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
              <span className="text-sm text-gray-500">题</span>
              <div className="flex gap-2 ml-2">
                {[10, 25, 50, 100].map((n) => (
                  <button
                    key={n}
                    onClick={() => setCustomQuestionCount(Math.max(minQuestionCount, n))}
                    className={clsx(
                      'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                      customQuestionCount === n
                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200'
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            {selectedDomains.length > 0 && (
              <p className="mt-2 text-xs text-gray-400">
                已选 {selectedDomains.length} 个域，最少 {minQuestionCount} 题
              </p>
            )}
          </div>
        )}

        {/* 顺序模式：每批题目数量 */}
        {mode === 'sequential' && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-800 p-6">
            <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-4">每批题目数量</h3>
            <div className="flex items-center gap-4">
              <input
                type="number"
                min={5}
                max={200}
                value={sequentialBatchSize}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 25;
                  setSequentialBatchSize(Math.max(5, Math.min(200, val)));
                }}
                className="w-24 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 text-center font-bold text-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
              />
              <span className="text-sm text-gray-500">题 / 批</span>
              <div className="flex gap-2 ml-2">
                {[10, 25, 50, 100].map((n) => (
                  <button
                    key={n}
                    onClick={() => setSequentialBatchSize(n)}
                    className={clsx(
                      'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                      sequentialBatchSize === n
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200'
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <p className="mt-2 text-xs text-gray-400">
              每完成一批后可继续下一批，进度会自动保存
            </p>
          </div>
        )}

        {/* 顺序模式进度 */}
        {mode === 'sequential' && sequentialProgress && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-green-200 dark:border-green-800 p-6">
            <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-2">
              <BookOpen size={18} className="text-green-500" />
              上次进度
            </h3>
            <div className="flex items-center gap-4 mb-4">
              <div className="flex-1">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  已完成至第 <span className="font-bold text-green-600">{sequentialProgress.lastQuestionNumber}</span> 题
                  {sequentialProgress.totalQuestions > 0 && (
                    <> / 共 {sequentialProgress.totalQuestions} 题</>
                  )}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  已答 {sequentialProgress.answeredCount} 题 · 
                  最近更新 {new Date(sequentialProgress.timestamp).toLocaleString('zh-CN')}
                </p>
                {sequentialProgress.totalQuestions > 0 && (
                  <div className="mt-2 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, (sequentialProgress.lastQuestionNumber / sequentialProgress.totalQuestions) * 100)}%`,
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setSequentialStartFrom(sequentialProgress.lastQuestionNumber);
                  startQuiz(sequentialProgress.lastQuestionNumber);
                }}
                disabled={isLoadingQuestions}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-green-600 text-white font-medium hover:bg-green-700 transition-colors shadow-lg shadow-green-500/20"
              >
                <Play size={16} />
                继续上次进度
              </button>
              <button
                onClick={() => {
                  if (user) clearSequentialProgress(user.id);
                  setSequentialProgressState(null);
                  setSequentialStartFrom(0);
                }}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                <RotateCcw size={16} />
                重新开始
              </button>
            </div>
          </div>
        )}

        {/* 开始按钮 */}
        <button
          onClick={() => startQuiz(mode === 'sequential' ? sequentialStartFrom : undefined)}
          disabled={isLoadingQuestions}
          className={clsx(
            'w-full py-4 rounded-2xl font-bold text-lg transition-all shadow-lg flex items-center justify-center gap-2',
            isLoadingQuestions
              ? 'bg-gray-400 cursor-not-allowed shadow-none'
              : mode === 'sequential'
              ? 'bg-gradient-to-r from-green-600 to-teal-600 text-white hover:from-green-700 hover:to-teal-700 shadow-green-500/25'
              : mode === 'exam'
              ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700 shadow-purple-500/25'
              : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 shadow-blue-500/25'
          )}
        >
          {isLoadingQuestions ? (
            <>
              <Loader2 size={22} className="animate-spin" />
              加载题目中...
            </>
          ) : mode === 'sequential' && sequentialProgress ? (
            '从头开始 →'
          ) : (
            '开始答题 →'
          )}
        </button>
      </div>
    );
  }

  // ═══════════════════ 已完成 ═══════════════════
  if (isCompleted) {
    const totalAnswered = Object.keys(results).length;
    const correctCount = Object.values(results).filter((r) => r.is_correct).length;
    const accuracy = totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : 0;

    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-800 p-8 text-center">
          <Trophy
            size={64}
            className={clsx('mx-auto mb-4', accuracy >= 70 ? 'text-yellow-500' : 'text-gray-400')}
          />
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            {mode === 'exam'
              ? '考试完成！'
              : mode === 'sequential'
              ? '本批完成！'
              : '练习完成！'}
          </h2>
          <p className="text-5xl font-bold text-indigo-600 mb-2">{accuracy}%</p>
          <p className="text-gray-500">
            {correctCount} / {totalAnswered} 题正确
          </p>

          {/* 顺序模式进度 */}
          {mode === 'sequential' && sequentialProgress && (
            <div className="mt-4 p-3 rounded-xl bg-green-50 dark:bg-green-900/10 text-sm text-green-700 dark:text-green-300">
              总进度：已完成至第 {sequentialProgress.lastQuestionNumber} 题
              {sequentialGrandTotal > 0 && (
                <> / 共 {sequentialGrandTotal} 题 ({Math.round((sequentialProgress.lastQuestionNumber / sequentialGrandTotal) * 100)}%)</>
              )}
            </div>
          )}

          <div className="mt-6 flex gap-3 justify-center flex-wrap">
            {/* 顺序模式：继续下一批 */}
            {mode === 'sequential' && hasMoreQuestions && (
              <button
                onClick={handleSequentialNext}
                className="px-6 py-3 rounded-xl bg-green-600 text-white font-medium hover:bg-green-700 transition-colors flex items-center gap-2"
              >
                <ArrowRight size={18} />
                继续下一批 {sequentialBatchSize} 题
              </button>
            )}

            {/* 顺序模式全部完成 */}
            {mode === 'sequential' && !hasMoreQuestions && (
              <div className="w-full mb-2 p-3 rounded-xl bg-yellow-50 dark:bg-yellow-900/10 text-yellow-700 dark:text-yellow-300 text-sm font-medium">
                🎉 恭喜！所有题目已刷完！
              </div>
            )}

            <button
              onClick={() => {
                setIsStarted(false);
                setIsCompleted(false);
                setQuestions([]);
              }}
              className="px-6 py-3 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
            >
              {mode === 'sequential' ? '返回设置' : '再来一次'}
            </button>
            <button
              onClick={() => router.push('/wrong-questions')}
              className="px-6 py-3 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              查看错题
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════ 答题中 ═══════════════════
  const currentQuestion = questions[currentIndex];

  return (
    <div className="max-w-7xl mx-auto">
      {/* 顶部栏 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              flushPendingAnswer(); // 返回前提交当前未提交的答案
              setIsStarted(false);
              setIsCompleted(false);
              setQuestions([]);
            }}
            className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            ← 返回
          </button>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            {mode === 'exam'
              ? '模拟考试'
              : mode === 'sequential'
              ? '顺序刷题'
              : '练习模式'}
          </h1>
          {mode === 'sequential' && currentQuestion && (
            <span className="text-sm text-gray-500 dark:text-gray-400">
              第 {currentQuestion.question_number} 题
            </span>
          )}
        </div>

        {timeRemaining !== null && (
          <div
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-xl font-mono text-lg',
              timeRemaining < 300
                ? 'bg-red-100 dark:bg-red-900/30 text-red-600 animate-pulse'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
            )}
          >
            <Timer size={20} />
            {formatTime(timeRemaining)}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 主内容区 */}
        <div className="lg:col-span-2 space-y-6">
          {currentQuestion && (
            <QuestionCard
              key={currentQuestion.id}
              question={currentQuestion}
              questionIndex={currentIndex}
              totalQuestions={questions.length}
              mode={mode === 'sequential' ? 'practice' : mode}
              onSubmit={handleSubmitAnswer}
              onAnswerSelect={handleAnswerSelect}
              onRequestExplanation={handleRequestExplanation}
              result={results[currentQuestion.id] || null}
              showResult={mode !== 'exam' && !!results[currentQuestion.id]}
              savedAnswer={answers[currentQuestion.id] || undefined}
            />
          )}

          {/* AI 解析面板 */}
          {(isAiLoading || aiExplanation) && (
            <AIExplanationPanel explanation={aiExplanation} isLoading={isAiLoading} />
          )}

          {/* 上一题 / 下一题 */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => goToQuestion(currentIndex - 1)}
              disabled={currentIndex === 0}
              className={clsx(
                'flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-colors',
                currentIndex === 0
                  ? 'text-gray-300 cursor-not-allowed'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              )}
            >
              <ChevronLeft size={18} /> 上一题
            </button>

            {currentIndex === questions.length - 1 ? (
              <button
                onClick={() => {
                  flushPendingAnswer(); // 提交最后一题的答案
                  setIsCompleted(true);
                }}
                className="flex items-center gap-2 px-6 py-2 rounded-xl bg-green-600 text-white font-medium hover:bg-green-700 transition-colors"
              >
                完成 <Trophy size={18} />
              </button>
            ) : (
              <button
                onClick={() => goToQuestion(currentIndex + 1)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 font-medium transition-colors"
              >
                下一题 <ChevronRight size={18} />
              </button>
            )}
          </div>
        </div>

        {/* 右侧面板 */}
        <div className="space-y-6">
          <NavigationMatrix
            totalQuestions={questions.length}
            currentIndex={currentIndex}
            answers={answers}
            questionIds={questions.map((q) => q.id)}
            results={
              mode !== 'exam'
                ? Object.fromEntries(
                    Object.entries(results).map(([id, r]) => [id, r.is_correct])
                  )
                : undefined
            }
            onNavigate={goToQuestion}
          />

          {/* 名词速查 */}
          <TermLookup />
        </div>
      </div>
    </div>
  );
}

export default function QuizPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500" />
        </div>
      }
    >
      <QuizContent />
    </Suspense>
  );
}
