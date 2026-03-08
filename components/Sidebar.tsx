'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  BookOpen,
  AlertTriangle,
  Settings,
  GraduationCap,
  Shield,
} from 'lucide-react';
import clsx from 'clsx';

const navItems = [
  { href: '/dashboard', label: '学习总览', icon: LayoutDashboard },
  { href: '/quiz', label: '开始答题', icon: BookOpen },
  { href: '/wrong-questions', label: '错题本', icon: AlertTriangle },
  { href: '/settings', label: '设置', icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col z-50">
      {/* Logo */}
      <div className="p-6 border-b border-gray-100 dark:border-gray-800">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center">
            <Shield className="text-white" size={22} />
          </div>
          <div>
            <h1 className="font-bold text-gray-900 dark:text-white text-lg">CISSP</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">复习助手</p>
          </div>
        </Link>
      </div>

      {/* 导航 */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || pathname?.startsWith(item.href + '/');
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200'
              )}
            >
              <Icon size={20} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* 底部 */}
      <div className="p-4 border-t border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center">
            <GraduationCap className="text-white" size={16} />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
              CISSP 学员
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              持续学习中
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
