import type { Metadata } from "next";
import "./globals.css";
import { AppProvider } from "@/lib/context/AppContext";

export const metadata: Metadata = {
  title: "耀聖藥局智慧排班系統",
  description: "耀聖藥局智慧排班管理平台",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW">
      <body>
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
