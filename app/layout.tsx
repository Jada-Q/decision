import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "决策辅助工具",
  description: "四步结构化决策分析，AI辅助判断",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full bg-stone-50 text-stone-900">{children}</body>
    </html>
  );
}
