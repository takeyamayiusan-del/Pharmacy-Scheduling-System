import type { Metadata } from "next";
import "./globals.css";
import { AppProvider } from "@/lib/context/AppContext";
import { SYSTEM_DESCRIPTION, SYSTEM_NAME } from "@/lib/sites";

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
    <html lang="zh-TW">
      <body>
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
