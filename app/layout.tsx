import type { Metadata } from "next";
import { Noto_Sans_TC } from "next/font/google";
import "./globals.css";
import { AppProvider } from "@/lib/context/AppContext";
import { SYSTEM_DESCRIPTION, SYSTEM_NAME } from "@/lib/sites";

const notoSansTC = Noto_Sans_TC({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
  variable: "--font-sans",
  // CJK fallback metrics differ; avoid mismatched Latin fallback sizing
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: SYSTEM_NAME,
  description: SYSTEM_DESCRIPTION,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW" className={notoSansTC.variable}>
      <body className={`${notoSansTC.className} font-sans`}>
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
