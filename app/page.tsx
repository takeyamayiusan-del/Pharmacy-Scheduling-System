'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/lib/context/AppContext';
import { canManageSite } from '@/lib/auth/roles';
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
        currentUser.role === "owner" || canManageSite(currentUser.role)
          ? "/schedule"
          : "/attendance/punch";
      router.replace(dest);
    } else {
      router.replace("/login");
    }
  }, [currentUser, isLoading, router, hasRedirected]);

  return (
    <div className="min-h-screen flex items-center justify-center app-shell relative">
      <div className="pointer-events-none absolute inset-0 app-shell-mesh opacity-70" aria-hidden />
      <div className="text-center app-fade-in relative">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 mb-3">
          <span className="bg-gradient-to-r from-sky-700 to-cyan-600 bg-clip-text text-transparent">
            {SYSTEM_NAME}
          </span>
        </h1>
        <p className="text-slate-600">竹山／集集多分店排班</p>
        <p className="text-sm text-slate-400 mt-3">載入中...</p>
      </div>
    </div>
  );
}
