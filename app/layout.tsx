import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AppProvider } from "@/lib/context/AppContext";
import { SYSTEM_DESCRIPTION, SYSTEM_NAME } from "@/lib/sites";

/** IBM Plex Sans TC（OFL）— 適合 UI／後台的繁中無襯線體 */
const ibmPlexSansTC = localFont({
  src: [
    {
      path: "./fonts/IBMPlexSansTC-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/IBMPlexSansTC-Medium.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "./fonts/IBMPlexSansTC-Bold.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  display: "swap",
  variable: "--font-sans",
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
    <html lang="zh-TW" className={ibmPlexSansTC.variable}>
      <body className={`${ibmPlexSansTC.className} font-sans`}>
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
