import "./globals.css";
import { DEFAULT_LOCALE } from "@f1/domain";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "F1 AI Second Screen",
  description: "Understand Formula 1 races in real time.",
};

// 루트 레이아웃. lang 은 [locale] 세그먼트에서 클라이언트로 갱신한다.
const RootLayout = ({ children }: { children: ReactNode }) => (
  <html lang={DEFAULT_LOCALE} suppressHydrationWarning>
    <body className="min-h-screen antialiased">{children}</body>
  </html>
);

export default RootLayout;
