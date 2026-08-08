'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/lib/context/AppContext';
import { SYSTEM_NAME } from '@/lib/sites';

export default function RootPage() {
  const { currentUser, isLoading } = useApp();
  const router = useRouter();
  const [hasRedirected, setHasRedirected] = useState(false);

  useEffect(() => {
    if (isLoading || hasRedirected) return;
    setHasRedirected(true);
    if (currentUser) {
      const dest =
        currentUser.role === "owner" || currentUser.role === "manager"
          ? "/schedule"
          : "/attendance/punch";
      router.replace(dest);
    } else {
      router.replace("/login");
    }
  }, [currentUser, isLoading, router, hasRedirected]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-800 mb-4">{SYSTEM_NAME}</h1>
        <p className="text-gray-600">竹山／集集多分店排班</p>
        <p className="text-sm text-gray-400 mt-2">載入中...</p>
      </div>
    </div>
  );
}
