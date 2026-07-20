import { type NextRequest, NextResponse } from "next/server";

/**
 * 本機開發暫時停用 middleware（Node 24 與 Next.js 14 SWC 不相容時避免 500）。
 * 登入保護仍由 app/(dashboard)/layout.tsx 客戶端處理。
 * 安裝 Node 20 LTS 後可改回 updateSession 版本。
 */
export async function middleware(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
