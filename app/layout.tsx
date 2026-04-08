import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI决策辩论 — 两个AI帮你看清选择的两面",
  description: "填写你的情况，支持者和挑战者两个AI角色同时分析你的决策。免费、匿名、即时出结果。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full bg-stone-50 text-stone-900">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
