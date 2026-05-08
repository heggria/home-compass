import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Home Compass · 让普通人在买房前看清真相",
  description:
    "用公开数据,把北京板块、成交、政策一次说清楚。30 秒看懂一个板块到底值不值。",
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "Home Compass",
    description: "30 秒看懂一个板块到底值不值",
    locale: "zh_CN",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className="dark">
      <body className="min-h-screen bg-ink-950 text-zinc-100">{children}</body>
    </html>
  );
}
