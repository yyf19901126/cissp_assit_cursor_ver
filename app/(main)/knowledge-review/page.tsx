'use client';

import { CircleDashed } from 'lucide-react';

export default function KnowledgeReviewPage() {
  return (
    <div className="w-full min-w-0 max-w-5xl mx-auto">
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-8 sm:p-10 text-center">
        <CircleDashed size={42} className="mx-auto text-indigo-500 mb-4" />
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
          知识点复习
        </h1>
        <p className="mt-3 text-sm sm:text-base text-gray-500 dark:text-gray-400">
          该模块即将上线，入口已预留。你后续会在这里按知识点进行系统复习。
        </p>
      </div>
    </div>
  );
}
