'use client';

import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { DomainProgress } from '@/types/database';

interface DomainRadarChartProps {
  data: DomainProgress[];
}

export default function DomainRadarChart({ data }: DomainRadarChartProps) {
  const chartData = data.map((d) => ({
    domain: `D${d.domain_id}`,
    fullName: d.domain_name_zh,
    accuracy: d.accuracy,
    answered: d.answered_questions,
    total: d.total_questions,
  }));

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-800 p-6">
      <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200 mb-4">
        📊 八大知识域掌握雷达
      </h3>

      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart cx="50%" cy="50%" outerRadius="75%" data={chartData}>
            <PolarGrid
              stroke="#e5e7eb"
              strokeDasharray="3 3"
            />
            <PolarAngleAxis
              dataKey="domain"
              tick={{ fill: '#6b7280', fontSize: 12, fontWeight: 600 }}
            />
            <PolarRadiusAxis
              angle={90}
              domain={[0, 100]}
              tick={{ fill: '#9ca3af', fontSize: 10 }}
            />
            <Tooltip
              content={({ payload }) => {
                if (!payload || payload.length === 0) return null;
                const item = payload[0].payload;
                return (
                  <div className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-lg border text-sm">
                    <p className="font-bold text-gray-800 dark:text-gray-200">
                      {item.fullName}
                    </p>
                    <p className="text-blue-600">正确率: {item.accuracy}%</p>
                    <p className="text-gray-500">
                      已答: {item.answered}/{item.total}
                    </p>
                  </div>
                );
              }}
            />
            <Radar
              name="正确率"
              dataKey="accuracy"
              stroke="#6366f1"
              fill="#6366f1"
              fillOpacity={0.25}
              strokeWidth={2}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* 域名图例 */}
      <div className="mt-4 grid grid-cols-2 gap-2">
        {data.map((d) => (
          <div
            key={d.domain_id}
            className="flex items-center justify-between text-xs px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800"
          >
            <span className="text-gray-600 dark:text-gray-400">
              <span className="font-bold text-indigo-600 dark:text-indigo-400 mr-1">
                D{d.domain_id}
              </span>
              {d.domain_name_zh}
            </span>
            <span
              className={
                d.accuracy >= 70
                  ? 'text-green-600 font-bold'
                  : d.accuracy >= 50
                  ? 'text-amber-600 font-bold'
                  : 'text-red-600 font-bold'
              }
            >
              {d.accuracy}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
