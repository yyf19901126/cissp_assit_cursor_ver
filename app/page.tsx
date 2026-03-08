'use client';

import { useRouter } from 'next/navigation';
import { Shield, BookOpen, Brain, Target, ArrowRight, Zap } from 'lucide-react';

export default function Home() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 text-white">
      {/* Hero Section */}
      <div className="max-w-6xl mx-auto px-6 pt-20 pb-32">
        {/* Nav */}
        <nav className="flex items-center justify-between mb-20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
              <Shield size={22} />
            </div>
            <span className="font-bold text-xl">CISSP 复习助手</span>
          </div>
          <button
            onClick={() => router.push('/login')}
            className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-sm text-sm font-medium transition-colors"
          >
            登录 / 注册
          </button>
        </nav>

        {/* Hero */}
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm text-sm text-blue-300 mb-8">
            <Zap size={14} />
            AI 驱动的 CISSP 备考助手
          </div>
          <h1 className="text-5xl md:text-6xl font-extrabold leading-tight mb-6">
            更聪明地备考
            <br />
            <span className="bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent">
              CISSP 认证考试
            </span>
          </h1>
          <p className="text-lg text-slate-400 mb-10 max-w-2xl mx-auto leading-relaxed">
            1500+ 真题题库 · AI 深度解析 · 8 大知识域覆盖 · 管理思维训练
            <br />
            智能错题追踪，精准定位薄弱环节，让你的备考事半功倍
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => router.push('/login')}
              className="px-8 py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 font-bold text-lg shadow-2xl shadow-blue-500/25 transition-all flex items-center gap-2"
            >
              开始学习
              <ArrowRight size={20} />
            </button>
            <button
              onClick={() => router.push('/register')}
              className="px-8 py-4 rounded-2xl bg-white/5 hover:bg-white/10 backdrop-blur-sm font-medium text-lg border border-white/10 transition-all"
            >
              注册账号
            </button>
          </div>
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-24">
          <FeatureCard
            icon={<BookOpen size={24} />}
            title="1500+ 题库"
            description="覆盖 CISSP 8 大知识域，支持 PDF 批量导入，题目分类标注精确到子知识点"
            color="blue"
          />
          <FeatureCard
            icon={<Brain size={24} />}
            title="AI 深度解析"
            description="不只是答案解析，更有管理思维分析、CBK 知识溯源、题眼高亮，深度理解每一题"
            color="purple"
          />
          <FeatureCard
            icon={<Target size={24} />}
            title="精准提升"
            description="智能错题追踪、域级正确率雷达图、薄弱环节自动推荐，让复习有的放矢"
            color="indigo"
          />
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/10 py-8 text-center text-sm text-slate-500">
        <p>CISSP Study Assistant · Built with Next.js & AI</p>
      </footer>
    </main>
  );
}

function FeatureCard({
  icon,
  title,
  description,
  color,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    blue: 'from-blue-500/20 to-blue-600/5 border-blue-500/20',
    purple: 'from-purple-500/20 to-purple-600/5 border-purple-500/20',
    indigo: 'from-indigo-500/20 to-indigo-600/5 border-indigo-500/20',
  };

  const iconColorMap: Record<string, string> = {
    blue: 'text-blue-400',
    purple: 'text-purple-400',
    indigo: 'text-indigo-400',
  };

  return (
    <div
      className={`p-6 rounded-2xl bg-gradient-to-b ${colorMap[color]} border backdrop-blur-sm`}
    >
      <div
        className={`w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center mb-4 ${iconColorMap[color]}`}
      >
        {icon}
      </div>
      <h3 className="font-bold text-lg text-white mb-2">{title}</h3>
      <p className="text-sm text-slate-400 leading-relaxed">{description}</p>
    </div>
  );
}
