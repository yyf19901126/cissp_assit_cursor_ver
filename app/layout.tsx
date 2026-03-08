import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CISSP 复习助手 - AI 驱动的认证考试备考工具',
  description:
    '基于 AI 的 CISSP 认证考试复习助手，1500+ 题库、深度解析、错题追踪、知识域雷达分析',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="antialiased">{children}</body>
    </html>
  );
}
