'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/lib/context/AppContext';

export default function RootPage() {
  const { currentUser } = useApp();
  const router = useRouter();
  const [hasRedirected, setHasRedirected] = useState(false);

  useEffect(() => {
    if (!hasRedirected) {
      setHasRedirected(true);
      if (currentUser) {
        router.replace('/schedule');
      } else {
        router.replace('/login');
      }
    }
  }, [currentUser, router, hasRedirected]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-800 mb-4">耀聖藥局</h1>
        <p className="text-gray-600">智慧排班管理系統</p>
        <p className="text-sm text-gray-400 mt-2">載入中...</p>
      </div>
    </div>
  );
}
