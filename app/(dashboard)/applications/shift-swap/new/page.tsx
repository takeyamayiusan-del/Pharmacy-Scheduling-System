'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

/** 舊路由：導向主換班頁（統一走 AppContext） */
export default function NewShiftSwapApplicationRedirectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    const swapDate = params.get('swap_date');
    if (swapDate && !params.get('date')) {
      params.set('date', swapDate);
    }
    const targetId = params.get('target_id');
    if (targetId && !params.get('targetEmployeeId')) {
      params.set('targetEmployeeId', targetId);
    }
    const query = params.toString();
    router.replace(query ? `/applications/shift-swap?${query}` : '/applications/shift-swap');
  }, [router, searchParams]);

  return (
    <div className="text-center py-12 text-gray-500">
      正在導向換班申請頁面…
    </div>
  );
}
