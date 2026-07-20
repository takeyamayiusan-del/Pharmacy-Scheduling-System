'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** 舊路由：導向主加班頁（統一走 AppContext） */
export default function NewOvertimeApplicationRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/applications/overtime');
  }, [router]);

  return (
    <div className="text-center py-12 text-gray-500">
      正在導向加班申請頁面…
    </div>
  );
}
