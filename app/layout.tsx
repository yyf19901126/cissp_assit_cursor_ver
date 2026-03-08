import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'CISSP 复习助手',
  description: '专为 CISSP 认证考试设计的复习助手应用',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  )
}
