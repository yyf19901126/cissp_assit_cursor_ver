'use client';

import { useState } from 'react';
import { Settings, Database, Brain, Key, Save, CheckCircle } from 'lucide-react';
import clsx from 'clsx';

export default function SettingsPage() {
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseKey, setSupabaseKey] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState('https://api.openai.com/v1');
  const [openaiModel, setOpenaiModel] = useState('gpt-4o');
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    // 在实际应用中，这些配置应通过环境变量或安全存储管理
    // 此页面仅供演示
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
          <Settings className="text-gray-500" />
          设置
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          配置数据库连接和 AI 模型
        </p>
      </div>

      {/* Supabase 配置 */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-800 p-6">
        <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
          <Database size={20} className="text-green-500" />
          Supabase 数据库配置
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Project URL
            </label>
            <input
              type="text"
              value={supabaseUrl}
              onChange={(e) => setSupabaseUrl(e.target.value)}
              placeholder="https://xxxxx.supabase.co"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Anon Key
            </label>
            <input
              type="password"
              value={supabaseKey}
              onChange={(e) => setSupabaseKey(e.target.value)}
              placeholder="eyJ..."
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
            />
          </div>
        </div>
      </div>

      {/* AI 配置 */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-800 p-6">
        <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
          <Brain size={20} className="text-purple-500" />
          AI 模型配置
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              API Key
            </label>
            <input
              type="password"
              value={openaiKey}
              onChange={(e) => setOpenaiKey(e.target.value)}
              placeholder="sk-..."
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Base URL（支持自定义端点）
            </label>
            <input
              type="text"
              value={openaiBaseUrl}
              onChange={(e) => setOpenaiBaseUrl(e.target.value)}
              placeholder="https://api.openai.com/v1"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
            />
            <p className="text-xs text-gray-400 mt-1">
              支持 GPT-5.2/5.4 等自定义模型节点
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              模型名称
            </label>
            <select
              value={openaiModel}
              onChange={(e) => setOpenaiModel(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
            >
              <option value="gpt-4o">GPT-4o</option>
              <option value="gpt-4o-mini">GPT-4o Mini</option>
              <option value="gpt-4-turbo">GPT-4 Turbo</option>
              <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
              <option value="custom">自定义模型</option>
            </select>
          </div>
        </div>
      </div>

      {/* PDF 解析说明 */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-800 p-6">
        <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
          <Key size={20} className="text-amber-500" />
          PDF 题库导入
        </h3>
        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 text-sm text-gray-600 dark:text-gray-400 space-y-2">
          <p>使用命令行导入 PDF 题库：</p>
          <code className="block bg-gray-900 text-green-400 p-3 rounded-lg text-xs">
            npx ts-node scripts/parse-pdf.ts ./path/to/cissp-questions.pdf
          </code>
          <p className="text-xs text-gray-400 mt-2">
            • 支持断点续传（每50题自动保存进度）<br />
            • 自动识别题号、选项、答案、解析<br />
            • AI 自动标注知识域（Domain 1-8）
          </p>
        </div>
      </div>

      {/* 保存按钮 */}
      <button
        onClick={handleSave}
        className={clsx(
          'w-full py-3 rounded-2xl font-medium transition-all flex items-center justify-center gap-2',
          saved
            ? 'bg-green-600 text-white'
            : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-500/25'
        )}
      >
        {saved ? (
          <>
            <CheckCircle size={20} />
            已保存
          </>
        ) : (
          <>
            <Save size={20} />
            保存设置
          </>
        )}
      </button>

      <p className="text-xs text-center text-gray-400">
        注意：生产环境中，敏感配置应通过环境变量管理（.env.local），不要在前端暴露密钥
      </p>
    </div>
  );
}
