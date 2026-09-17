import type { Metadata } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "./providers";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { AdminPanel } from "../components/AdminPanel";
import { DEMO_FACTORY_ADDRESS } from "../constants/contracts";

export const metadata: Metadata = {
  title: "Creator Revenue Bridge",
  description: "미래 플랫폼 수익을 활용한 RWA 기반 선지급 서비스",
};

const pretendard = localFont({
  src: "./fonts/PretendardVariable.woff2",
  display: "swap",
  weight: "45 920",
  variable: "--font-pretendard",
});

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ko">
      <body className={pretendard.variable}>
        <Providers>
          <div className="flex min-h-screen flex-col bg-white font-sans text-gray-900">
            <Header />
            <div className="flex flex-1 flex-col">{children}</div>
            <Footer />
            {DEMO_FACTORY_ADDRESS && <AdminPanel />}
          </div>
        </Providers>
      </body>
    </html>
  );
}
