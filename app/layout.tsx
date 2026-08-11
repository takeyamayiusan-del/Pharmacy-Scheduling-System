import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AppProvider } from "@/lib/context/AppContext";
import { SYSTEM_DESCRIPTION, SYSTEM_NAME } from "@/lib/sites";

/** jf open 粉圓（SIL OFL）— justfont 開源圓體 */
const jfOpenHuninn = localFont({
  src: "./fonts/jf-openhuninn-2.1.ttf",
  display: "swap",
  variable: "--font-sans",
  weight: "400",
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
    <html lang="zh-TW" className={jfOpenHuninn.variable}>
      <body className={`${jfOpenHuninn.className} font-sans`}>
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
