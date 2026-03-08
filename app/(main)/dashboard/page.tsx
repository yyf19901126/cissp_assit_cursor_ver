'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import DomainRadarChart from '@/components/DomainRadarChart';
import { DomainProgress, CISSP_DOMAINS } from '@/types/database';
import {
  BookOpen,
  Target,
  TrendingUp,
  Clock,
  AlertTriangle,
  Play,
  ArrowRight,
  Loader2,
  Database,
  ListOrdered,
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '@/contexts/AuthContext';

// 初始空数据
const emptyDomainProgress: DomainProgress[] = CISSP_DOMAINS.map((d) => ({
  domain_id: d.id as any,
  domain_name: d.name,
  domain_name_zh: d.nameZh,
  total_questions: 0,
  answered_questions: 0,
  correct_count: 0,
  accuracy: 0,
}));

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [domainProgress, setDomainProgress] = useState<DomainProgress[]>(emptyDomainProgress);
  const [overallStats, setOverallStats] = useState({
    total_questions: 0,
    total_answered: 0,
    total_correct: 0,
    accuracy: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProgress = useCallback(async () => {
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch('/api/quiz/progress', { credentials: 'include' });
      console.log('[Dashboard] API status:', res.status, 'user:', user?.id);
      if (res.ok) {
        const data = await res.json();
        console.log('[Dashboard] API response overall:', JSON.stringify(data.overall));
        console.log('[Dashboard] _debug from server:', JSON.stringify(data._debug));
        console.log('[Dashboard] AuthContext user.id:', user?.id);
        if (data.domains) {
          setDomainProgress(data.domains);
        }
        if (data.overall) {
          setOverallStats(data.overall);
        }
      } else if (res.status === 401) {
        console.log('[Dashboard] 401 - redirecting to login');
        setError('未登录，请重新登录');
        router.push('/login');
        return;
      } else {
        const errData = await res.json().catch(() => ({}));
        console.error('[Dashboard] API error:', res.status, errData);
        setError(errData.error || '无法连接数据库，请检查环境变量配置');
      }
    } catch (err) {
      console.error('[Dashboard] Fetch error:', err);
      setError('网络错误，请稍后重试');
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  // 当认证完成且有用户时获取数据
  useEffect(() => {
    if (!authLoading && user) {
      fetchProgress();
    } else if (!authLoading && !user) {
      setIsLoading(false);
    }
  }, [authLoading, user, fetchProgress]);

  const weakestDomains = [...domainProgress]
    .filter((d) => d.answered_questions > 0)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 3);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-indigo-500" size={40} />
          <p className="text-gray-500">加载学习进度...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* 欢迎头部 */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          学习总览
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          跟踪你的 CISSP 复习进度，找到薄弱环节，针对性突破
        </p>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 flex items-center justify-between">
          <span className="text-red-700 dark:text-red-300 text-sm">⚠️ {error}</span>
          <button
            onClick={fetchProgress}
            className="px-3 py-1 rounded-lg bg-red-100 dark:bg-red-800 text-red-700 dark:text-red-300 text-sm font-medium hover:bg-red-200"
          >
            重试
          </button>
        </div>
      )}

      {/* 题库为空提示 */}
      {!error && overallStats.total_questions === 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-amber-200 dark:border-amber-800 p-8 text-center">
          <Database size={48} className="mx-auto text-amber-500 mb-4" />
          <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200 mb-2">
            题库为空
          </h3>
          <p className="text-gray-500 text-sm mb-4">
            还没有导入题目，请前往设置页面上传 PDF 题库
          </p>
          <button
            onClick={() => router.push('/settings')}
            className="px-6 py-2 rounded-xl bg-amber-500 text-white font-medium hover:bg-amber-600 transition-colors"
          >
            前往导入题库
          </button>
        </div>
      )}

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          icon={<BookOpen size={22} />}
          label="题库总量"
          value={overallStats.total_questions.toString()}
          color="blue"
        />
        <StatCard
          icon={<Target size={22} />}
          label="已完成"
          value={overallStats.total_answered.toString()}
          color="green"
          sub={overallStats.total_questions > 0 ? `${Math.round(
            (overallStats.total_answered / overallStats.total_questions) * 100
          )}% 完成率` : undefined}
        />
        <StatCard
          icon={<TrendingUp size={22} />}
          label="正确率"
          value={`${overallStats.accuracy}%`}
          color="indigo"
        />
        <StatCard
          icon={<Clock size={22} />}
          label="错题数"
          value={(overallStats.total_answered - overallStats.total_correct).toString()}
          color="red"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 雷达图 */}
        <DomainRadarChart data={domainProgress} />

        {/* 薄弱领域 + 快速操作 */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-800 p-6">
          <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
            <AlertTriangle size={20} className="text-amber-500" />
            薄弱领域 Top 3
          </h3>

          {weakestDomains.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-400 text-sm">还没有答题记录，开始练习后这里会显示薄弱领域</p>
            </div>
          ) : (
            <div className="space-y-4">
              {weakestDomains.map((d, i) => (
                <div
                  key={d.domain_id}
                  className="flex items-center gap-4 p-4 rounded-xl bg-gray-50 dark:bg-gray-800"
                >
                  <span
                    className={clsx(
                      'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold',
                      i === 0
                        ? 'bg-red-100 text-red-600'
                        : i === 1
                        ? 'bg-amber-100 text-amber-600'
                        : 'bg-yellow-100 text-yellow-600'
                    )}
                  >
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">
                      Domain {d.domain_id}: {d.domain_name_zh}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className={clsx(
                            'h-full rounded-full transition-all',
                            d.accuracy < 50
                              ? 'bg-red-500'
                              : d.accuracy < 70
                              ? 'bg-amber-500'
                              : 'bg-green-500'
                          )}
                          style={{ width: `${d.accuracy}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium text-gray-500 w-10 text-right">
                        {d.accuracy}%
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => router.push(`/quiz?domain=${d.domain_id}`)}
                    className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-xs font-medium hover:bg-indigo-200 transition-colors"
                  >
                    强化
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 快速操作 */}
          <div className="mt-6 space-y-3">
            <button
              onClick={() => router.push('/quiz?mode=practice')}
              className={clsx(
                'w-full flex items-center justify-between p-4 rounded-xl text-white transition-all shadow-lg',
                overallStats.total_questions > 0
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-blue-500/20'
                  : 'bg-gray-400 cursor-not-allowed shadow-none'
              )}
              disabled={overallStats.total_questions === 0}
            >
              <div className="flex items-center gap-3">
                <Play size={20} />
                <span className="font-medium">随机练习</span>
              </div>
              <ArrowRight size={18} />
            </button>
            <button
              onClick={() => router.push('/quiz?mode=exam')}
              className={clsx(
                'w-full flex items-center justify-between p-4 rounded-xl text-white transition-all shadow-lg',
                overallStats.total_questions > 0
                  ? 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 shadow-purple-500/20'
                  : 'bg-gray-400 cursor-not-allowed shadow-none'
              )}
              disabled={overallStats.total_questions === 0}
            >
              <div className="flex items-center gap-3">
                <Target size={20} />
                <span className="font-medium">模拟考试 (125题 / 180分钟)</span>
              </div>
              <ArrowRight size={18} />
            </button>
            <button
              onClick={() => router.push('/quiz?mode=sequential')}
              className={clsx(
                'w-full flex items-center justify-between p-4 rounded-xl text-white transition-all shadow-lg',
                overallStats.total_questions > 0
                  ? 'bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-700 hover:to-teal-700 shadow-green-500/20'
                  : 'bg-gray-400 cursor-not-allowed shadow-none'
              )}
              disabled={overallStats.total_questions === 0}
            >
              <div className="flex items-center gap-3">
                <ListOrdered size={20} />
                <span className="font-medium">顺序刷题（可暂停续做）</span>
              </div>
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* 各域详细进度 */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-800 p-6">
        <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200 mb-4">
          📋 八大知识域详情
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">
                  域
                </th>
                <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">
                  名称
                </th>
                <th className="text-center py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">
                  总题数
                </th>
                <th className="text-center py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">
                  已答
                </th>
                <th className="text-center py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">
                  正确率
                </th>
                <th className="text-center py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">
                  进度
                </th>
                <th className="text-center py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              {domainProgress.map((d) => (
                <tr
                  key={d.domain_id}
                  className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-bold text-sm">
                      {d.domain_id}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <p className="font-medium text-gray-800 dark:text-gray-200">
                      {d.domain_name_zh}
                    </p>
                    <p className="text-xs text-gray-400">{d.domain_name}</p>
                  </td>
                  <td className="text-center py-3 px-4 text-gray-600 dark:text-gray-400">
                    {d.total_questions}
                  </td>
                  <td className="text-center py-3 px-4 text-gray-600 dark:text-gray-400">
                    {d.answered_questions}
                  </td>
                  <td className="text-center py-3 px-4">
                    <span
                      className={clsx(
                        'px-2 py-0.5 rounded-full text-xs font-bold',
                        d.accuracy >= 70
                          ? 'bg-green-100 text-green-700'
                          : d.accuracy >= 50
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-red-100 text-red-700'
                      )}
                    >
                      {d.accuracy}%
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full transition-all"
                        style={{
                          width: `${
                            d.total_questions > 0
                              ? (d.answered_questions / d.total_questions) * 100
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </td>
                  <td className="text-center py-3 px-4">
                    <button
                      onClick={() =>
                        router.push(`/quiz?domain=${d.domain_id}&mode=practice`)
                      }
                      disabled={d.total_questions === 0}
                      className={clsx(
                        'px-3 py-1 rounded-lg text-xs font-medium transition-colors',
                        d.total_questions > 0
                          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200'
                          : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      )}
                    >
                      练习
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// 统计卡片组件
function StatCard({
  icon,
  label,
  value,
  color,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
  sub?: string;
}) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
    green: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
    indigo: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400',
    red: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-800 p-5">
      <div className="flex items-center gap-3">
        <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center', colorMap[color])}>
          {icon}
        </div>
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </div>
      </div>
    </div>
  );
}
