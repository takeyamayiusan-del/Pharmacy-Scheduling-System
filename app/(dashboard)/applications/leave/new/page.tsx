'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

/** 舊路由：導向主請假頁（統一走 AppContext） */
export default function NewLeaveApplicationRedirectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const query = searchParams.toString();
    router.replace(query ? `/applications/leave?${query}` : '/applications/leave');
  }, [router, searchParams]);

  return (
    <div className="text-center py-12 text-gray-500">
      正在導向請假申請頁面…
    </div>
  );
}
