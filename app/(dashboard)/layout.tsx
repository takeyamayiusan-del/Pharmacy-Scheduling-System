'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useApp, EMPLOYEES } from '@/lib/context/AppContext';
import {
  Calendar,
  Clock,
  UserPlus,
  LogOut,
  Layout,
  FileText,
  Repeat,
  TrendingUp,
  Bell,
} from 'lucide-react';
import Link from 'next/link';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { currentUser, logout, notifications, markNotificationRead } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const [showNotifications, setShowNotifications] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // 等待掛載後再進行路由跳轉
  useEffect(() => {
    if (isMounted && !currentUser && pathname !== '/login') {
      // 使用 setTimeout 避免立即跳轉
      setTimeout(() => {
        router.push('/login');
      }, 100);
    }
  }, [currentUser, router, isMounted, pathname]);

  if (!isMounted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">載入中...</div>
      </div>
    );
  }

  if (!currentUser) {
    return null;
  }

  const isManager = currentUser.role === 'owner' || currentUser.role === 'manager';
  const isBoss = currentUser.role === 'owner';
  
  const unreadCount = notifications.filter(
    (n) => n.userId === currentUser.id && !n.read
  ).length;

  const navItems = [
    { href: '/schedule', label: '班表', icon: Calendar, allowed: true },
    { href: '/leave-selection', label: '排休選擇', icon: Layout, allowed: true },
    { href: '/applications/leave', label: '請假申請', icon: FileText, allowed: true },
    { href: '/applications/shift-swap', label: '換班申請', icon: Repeat, allowed: true },
    { href: '/applications/overtime', label: '加班申請', icon: Clock, allowed: true },
    { href: '/attendance', label: '工時統計', icon: TrendingUp, allowed: true },
    { href: '/attendance/tardiness', label: '遲到管理', icon: Clock, allowed: isManager },
    { href: '/employees', label: '員工管理', icon: UserPlus, allowed: isBoss },
  ];

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const roleLabel = 
    currentUser.role === 'owner' ? '老闆' : 
    currentUser.role === 'manager' ? '店長' : '員工';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 頂部導航欄 */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-bold text-gray-900">耀聖藥局</h1>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">
                {currentUser.name} ({roleLabel})
              </span>
              
              {/* 通知按鈕 */}
              <div className="relative">
                <button
                  onClick={() => setShowNotifications(!showNotifications)}
                  className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
                >
                  <Bell className="h-5 w-5" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                      {unreadCount}
                    </span>
                  )}
                </button>
                
                {/* 通知下拉選單 */}
                {showNotifications && (
                  <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border z-50">
                    <div className="p-4 border-b">
                      <h3 className="font-semibold text-gray-900">通知</h3>
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                      {notifications
                        .filter((n) => n.userId === currentUser.id)
                        .slice(0, 10)
                        .map((notification) => (
                          <div
                            key={notification.id}
                            onClick={() => markNotificationRead(notification.id)}
                            className={`p-4 border-b cursor-pointer hover:bg-gray-50 ${
                              !notification.read ? 'bg-blue-50' : ''
                            }`}
                          >
                            <div className="font-medium text-gray-900">{notification.title}</div>
                            <div className="text-sm text-gray-600 mt-1">{notification.message}</div>
                            <div className="text-xs text-gray-400 mt-2">
                              {new Date(notification.createdAt).toLocaleString()}
                            </div>
                          </div>
                        ))}
                      {notifications.filter((n) => n.userId === currentUser.id).length === 0 && (
                        <div className="p-4 text-center text-gray-500">
                          沒有通知
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
              >
                <LogOut className="h-5 w-5" />
                <span className="text-sm">登出</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* 側邊欄 */}
        <aside className="w-64 bg-white shadow-sm min-h-screen border-r">
          <nav className="p-4 space-y-1">
            {navItems.filter(item => item.allowed).map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-blue-50 text-blue-600'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* 主要內容 */}
        <main className="flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
