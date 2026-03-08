'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import QuestionCard from '@/components/QuestionCard';
import NavigationMatrix from '@/components/NavigationMatrix';
import AIExplanationPanel from '@/components/AIExplanation';
import { Question, AIExplanation } from '@/types/database';
import { CISSP_DOMAINS } from '@/types/database';
import {
  Timer,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Trophy,
} from 'lucide-react';
import clsx from 'clsx';

// 模拟题目数据（Supabase 未连接时使用）
const MOCK_QUESTIONS: Question[] = [
  {
    id: 'mock-1',
    question_number: 1,
    domain: 1,
    question_text:
      'What is the MOST important reason for senior management to support information security?',
    options: [
      { label: 'A', text: 'To comply with regulatory requirements' },
      { label: 'B', text: 'To ensure the organization meets its business objectives' },
      { label: 'C', text: 'To protect the IT infrastructure' },
      { label: 'D', text: 'To reduce IT operational costs' },
    ],
    correct_answer: 'B',
    base_explanation:
      'Senior management supports security primarily to ensure business objectives are met. While compliance and infrastructure protection are important, they serve the larger goal of business continuity and success.',
    keywords: ['MOST', 'senior management'],
    created_at: new Date().toISOString(),
  },
  {
    id: 'mock-2',
    question_number: 2,
    domain: 1,
    question_text:
      'During a risk assessment, what should be the FIRST step?',
    options: [
      { label: 'A', text: 'Identify threats' },
      { label: 'B', text: 'Identify and value assets' },
      { label: 'C', text: 'Calculate risk exposure' },
      { label: 'D', text: 'Implement controls' },
    ],
    correct_answer: 'B',
    base_explanation:
      'The first step in risk assessment is to identify and value assets. You cannot assess threats or calculate risk without first knowing what you are trying to protect.',
    keywords: ['FIRST'],
    created_at: new Date().toISOString(),
  },
  {
    id: 'mock-3',
    question_number: 3,
    domain: 3,
    question_text:
      'Which of the following is the BEST description of the purpose of a security architecture?',
    options: [
      { label: 'A', text: 'To define the network topology' },
      { label: 'B', text: 'To provide a framework for implementing security controls' },
      { label: 'C', text: 'To identify all software vulnerabilities' },
      { label: 'D', text: 'To determine staffing requirements' },
    ],
    correct_answer: 'B',
    base_explanation:
      'A security architecture provides a structured framework for implementing security controls aligned with business requirements.',
    keywords: ['BEST'],
    created_at: new Date().toISOString(),
  },
  {
    id: 'mock-4',
    question_number: 4,
    domain: 5,
    question_text:
      'What is the PRIMARY purpose of identity management?',
    options: [
      { label: 'A', text: 'To encrypt all communications' },
      { label: 'B', text: 'To manage user provisioning and de-provisioning' },
      { label: 'C', text: 'To monitor network traffic' },
      { label: 'D', text: 'To perform vulnerability scanning' },
    ],
    correct_answer: 'B',
    base_explanation:
      'The primary purpose of identity management is to manage the lifecycle of user identities, including provisioning, maintenance, and de-provisioning of accounts.',
    keywords: ['PRIMARY'],
    created_at: new Date().toISOString(),
  },
  {
    id: 'mock-5',
    question_number: 5,
    domain: 7,
    question_text:
      'After a security incident has been contained, what is the NEXT step?',
    options: [
      { label: 'A', text: 'Eradication' },
      { label: 'B', text: 'Recovery' },
      { label: 'C', text: 'Lessons learned' },
      { label: 'D', text: 'Notification' },
    ],
    correct_answer: 'A',
    base_explanation:
      'After containment, the next step is eradication - removing the cause of the incident. This is followed by recovery, then lessons learned.',
    keywords: ['NEXT'],
    created_at: new Date().toISOString(),
  },
];

function QuizContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const modeParam = searchParams.get('mode') || 'practice';
  const domainParam = searchParams.get('domain');

  const [mode, setMode] = useState<'practice' | 'exam'>(
    modeParam as 'practice' | 'exam'
  );
  const [questions, setQuestions] = useState<Question[]>(MOCK_QUESTIONS);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<
    Record<string, { is_correct: boolean; correct_answer: string; explanation: string; keywords: string[] }>
  >({});
  const [aiExplanation, setAiExplanation] = useState<AIExplanation | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isStarted, setIsStarted] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [selectedDomain, setSelectedDomain] = useState<number | null>(
    domainParam ? parseInt(domainParam) : null
  );

  // 考试模式计时器
  useEffect(() => {
    if (mode !== 'exam' || !isStarted || isCompleted || timeRemaining === null)
      return;

    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev === null || prev <= 0) {
          setIsCompleted(true);
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [mode, isStarted, isCompleted, timeRemaining]);

  const startQuiz = useCallback(async () => {
    setIsStarted(true);
    setCurrentIndex(0);
    setAnswers({});
    setResults({});
    setIsCompleted(false);
    setAiExplanation(null);

    if (mode === 'exam') {
      setTimeRemaining(180 * 60); // 180分钟
    }

    // 尝试从 API 获取题目
    try {
      const params = new URLSearchParams();
      params.set('mode', mode);
      if (selectedDomain) params.set('domain', selectedDomain.toString());
      params.set('question_count', mode === 'exam' ? '125' : '25');

      const res = await fetch(`/api/quiz/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          domain: selectedDomain,
          question_count: mode === 'exam' ? 125 : 25,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        // 如果成功创建会话, 后续按会话获取
        console.log('会话创建成功', data);
      }
    } catch {
      // 使用本地模拟题目
      console.log('使用本地模拟题目');
    }
  }, [mode, selectedDomain]);

  const handleSubmitAnswer = async (answer: string) => {
    const question = questions[currentIndex];
    if (!question) return;

    setAnswers((prev) => ({ ...prev, [question.id]: answer }));

    // 尝试调用 API
    try {
      const res = await fetch('/api/quiz/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question_id: question.id,
          user_answer: answer,
          mode,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setResults((prev) => ({ ...prev, [question.id]: data }));
        return;
      }
    } catch {
      // 本地判断
    }

    // 本地判断
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

  const handleRequestExplanation = async () => {
    const question = questions[currentIndex];
    if (!question) return;

    setIsAiLoading(true);
    setAiExplanation(null);

    try {
      const res = await fetch('/api/ai/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question_id: question.id,
          user_answer: answers[question.id],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setAiExplanation(data.explanation);
      } else {
        // 模拟 AI 解析
        setAiExplanation({
          deep_analysis:
            '这道题考查的是信息安全管理的核心理念。CISSP 作为管理导向的认证，强调安全应当服务于业务目标。',
          domain_mapping: {
            domain_id: question.domain,
            domain_name:
              CISSP_DOMAINS.find((d) => d.id === question.domain)?.name || '',
            sub_topic: '安全治理原则',
          },
          cbk_reference:
            'OSG 第9版 第1章 - 安全治理通过安全策略、标准和指南来支持业务目标的实现。',
          manager_perspective:
            '作为管理者，信息安全的终极目标不是技术实现，而是保障业务持续运营和战略目标达成。所有安全投入都应可以追溯到业务价值。',
          key_highlights: question.keywords || ['MOST'],
          correct_reasoning:
            '正确答案关注的是业务目标，这符合 CISSP 的管理思维。安全是业务的推动者(enabler)，而非障碍。',
          wrong_reasoning:
            '其他选项虽然都是安全的重要方面，但它们都是手段而非目的。合规、基础设施保护和成本控制都服务于更高层的业务目标。',
        });
      }
    } catch {
      // 模拟数据
      setAiExplanation({
        deep_analysis: '（AI 服务未配置，此为模拟解析）这道题考查信息安全管理的核心原则。',
        domain_mapping: {
          domain_id: question.domain,
          domain_name:
            CISSP_DOMAINS.find((d) => d.id === question.domain)?.name || '',
          sub_topic: '安全治理',
        },
        cbk_reference: '参考 OSG 第9版相关章节',
        manager_perspective: '从管理视角来看，安全始终服务于业务目标。',
        key_highlights: question.keywords || [],
        correct_reasoning: '正确选项最符合管理层视角。',
        wrong_reasoning: '其他选项侧重技术层面而非管理层面。',
      });
    } finally {
      setIsAiLoading(false);
    }
  };

  const goToQuestion = (index: number) => {
    if (index >= 0 && index < questions.length) {
      setCurrentIndex(index);
      setAiExplanation(null);
    }
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m
      .toString()
      .padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // 未开始 - 显示选择界面
  if (!isStarted) {
    return (
      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            开始答题
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            选择模式和知识域，开始你的 CISSP 之旅
          </p>
        </div>

        {/* 模式选择 */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-800 p-6">
          <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-4">
            选择模式
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => setMode('practice')}
              className={clsx(
                'p-6 rounded-xl border-2 text-left transition-all',
                mode === 'practice'
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-blue-300'
              )}
            >
              <h4 className="font-bold text-gray-800 dark:text-gray-200">
                📝 练习模式
              </h4>
              <p className="text-sm text-gray-500 mt-1">
                每题即时反馈，可查看 AI 解析
              </p>
              <p className="text-xs text-gray-400 mt-2">25 题 / 不限时</p>
            </button>
            <button
              onClick={() => setMode('exam')}
              className={clsx(
                'p-6 rounded-xl border-2 text-left transition-all',
                mode === 'exam'
                  ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-purple-300'
              )}
            >
              <h4 className="font-bold text-gray-800 dark:text-gray-200">
                🎯 模拟考试
              </h4>
              <p className="text-sm text-gray-500 mt-1">
                限时答题，结束后统一查看结果
              </p>
              <p className="text-xs text-gray-400 mt-2">125 题 / 180 分钟</p>
            </button>
          </div>
        </div>

        {/* 域选择 */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-800 p-6">
          <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-4">
            选择知识域（可选）
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setSelectedDomain(null)}
              className={clsx(
                'p-3 rounded-xl border text-sm text-left transition-all',
                !selectedDomain
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300'
                  : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-indigo-300'
              )}
            >
              全部域
            </button>
            {CISSP_DOMAINS.map((d) => (
              <button
                key={d.id}
                onClick={() => setSelectedDomain(d.id)}
                className={clsx(
                  'p-3 rounded-xl border text-sm text-left transition-all',
                  selectedDomain === d.id
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300'
                    : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-indigo-300'
                )}
              >
                <span className="font-bold">D{d.id}</span> {d.nameZh}
              </button>
            ))}
          </div>
        </div>

        {/* 开始按钮 */}
        <button
          onClick={startQuiz}
          className="w-full py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold text-lg hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg shadow-blue-500/25"
        >
          开始答题 →
        </button>
      </div>
    );
  }

  // 已完成
  if (isCompleted) {
    const totalAnswered = Object.keys(results).length;
    const correctCount = Object.values(results).filter((r) => r.is_correct).length;
    const accuracy = totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : 0;

    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-800 p-8 text-center">
          <Trophy
            size={64}
            className={clsx(
              'mx-auto mb-4',
              accuracy >= 70 ? 'text-yellow-500' : 'text-gray-400'
            )}
          />
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            {mode === 'exam' ? '考试完成！' : '练习完成！'}
          </h2>
          <p className="text-5xl font-bold text-indigo-600 mb-2">{accuracy}%</p>
          <p className="text-gray-500">
            {correctCount} / {totalAnswered} 题正确
          </p>

          <div className="mt-6 flex gap-3 justify-center">
            <button
              onClick={() => {
                setIsStarted(false);
                setIsCompleted(false);
              }}
              className="px-6 py-3 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
            >
              再来一次
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

  const currentQuestion = questions[currentIndex];

  return (
    <div className="max-w-7xl mx-auto">
      {/* 顶部栏 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              setIsStarted(false);
              setIsCompleted(false);
            }}
            className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            ← 返回
          </button>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            {mode === 'exam' ? '模拟考试' : '练习模式'}
          </h1>
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
              question={currentQuestion}
              questionIndex={currentIndex}
              totalQuestions={questions.length}
              mode={mode}
              onSubmit={handleSubmitAnswer}
              onRequestExplanation={handleRequestExplanation}
              result={results[currentQuestion.id] || null}
              showResult={mode === 'practice' && !!results[currentQuestion.id]}
            />
          )}

          {/* AI 解析面板 */}
          {(isAiLoading || aiExplanation) && (
            <AIExplanationPanel
              explanation={aiExplanation}
              isLoading={isAiLoading}
            />
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
                onClick={() => setIsCompleted(true)}
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
              mode === 'practice'
                ? Object.fromEntries(
                    Object.entries(results).map(([id, r]) => [id, r.is_correct])
                  )
                : undefined
            }
            onNavigate={goToQuestion}
          />
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
