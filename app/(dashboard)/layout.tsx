'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useApp } from '@/lib/context/AppContext';
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
  Settings,
  MoonStar,
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  Fingerprint,
  DollarSign,
} from 'lucide-react';
import Link from 'next/link';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { currentUser, logout, notifications, markNotificationRead, refreshNotifications, getLeaveSummary, isLoading } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const [showNotifications, setShowNotifications] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [showLeaveReminder, setShowLeaveReminder] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!currentUser?.id) return;
    const timer = setInterval(() => {
      refreshNotifications();
    }, 45000);
    return () => clearInterval(timer);
  }, [currentUser?.id, refreshNotifications]);

  // 每月20號以後，若下個月尚未排休則顯示提醒（本月關閉後不再顯示）
  useEffect(() => {
    if (!isMounted || !currentUser || currentUser.role === 'owner') return;

    const today = new Date();
    const day = today.getDate();
    if (day < 20) return; // 20號以前不提醒

    const year = today.getFullYear();
    const month = today.getMonth() + 1; // 當前月份
    // 計算下個月
    const nextYear = month === 12 ? year + 1 : year;
    const nextMonth = month === 12 ? 1 : month + 1;

    // 檢查本月是否已關閉提醒（存在 localStorage）
    const dismissKey = `leaveReminder_dismissed_${year}_${month}_${currentUser.id}`;
    if (localStorage.getItem(dismissKey)) return;

    // 檢查下個月是否已有排休選擇
    const summary = getLeaveSummary(currentUser.id, nextYear, nextMonth);
    if (summary.selectedDates.length === 0) {
      setShowLeaveReminder(true);
    }
  }, [isMounted, currentUser, getLeaveSummary]);

  const dismissLeaveReminder = () => {
    if (!currentUser) return;
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth() + 1;
    const dismissKey = `leaveReminder_dismissed_${year}_${month}_${currentUser.id}`;
    localStorage.setItem(dismissKey, '1');
    setShowLeaveReminder(false);
  };

  // 等待掛載後再進行路由跳轉
  useEffect(() => {
    if (!isMounted) return;
    if (!currentUser && !isLoading && pathname !== '/login') {
      router.push('/login');
    }
  }, [currentUser, isLoading, router, isMounted, pathname]);

  if (!isMounted || isLoading) {
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
  
  const unreadCount = notifications.filter(
    (n) => n.userId === currentUser.id && !n.read
  ).length;

  const navItems = [
    { href: '/schedule', label: '班表', icon: Calendar, allowed: true },
    { href: '/leave-selection', label: '排休選擇', icon: Layout, allowed: true },
    { href: '/attendance/punch', label: '上下班打卡', icon: Fingerprint, allowed: currentUser.role !== 'owner' },
    { href: '/attendance/punch-admin', label: '打卡管理', icon: Clock, allowed: isManager },
    { href: '/fixed-shifts', label: '固定班表', icon: Settings, allowed: isManager },
    { href: '/wednesday-shifts', label: '禮三晚班', icon: MoonStar, allowed: true },
    { href: '/applications/leave', label: '請假申請', icon: FileText, allowed: true },
    { href: '/applications/shift-swap', label: '換班申請', icon: Repeat, allowed: true },
    { href: '/applications/overtime', label: '加班申請', icon: Clock, allowed: true },
    { href: '/attendance', label: '工時統計', icon: TrendingUp, allowed: true },
    { href: '/attendance/tardiness', label: '遲到管理', icon: Clock, allowed: isManager },
    { href: '/employees', label: '員工管理', icon: UserPlus, allowed: isManager },
    { href: '/payroll-detail', label: '薪資查詢', icon: DollarSign, allowed: true },
    { href: '/payroll', label: '薪資結算', icon: DollarSign, allowed: isManager },
  ];

  const handleNotificationClick = (notificationId: string, route?: string) => {
    markNotificationRead(notificationId);
    setShowNotifications(false);
    if (route) {
      router.push(route);
      return;
    }
    router.push('/notifications');
  };

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const closeMobileSidebar = () => {
    setIsMobileSidebarOpen(false);
  };

  const roleLabel = 
    currentUser.role === 'owner' ? '老闆' : 
    currentUser.role === 'manager' ? '店長' : '員工';

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50/60 via-sky-50/40 to-white">
      {/* 頂部導航欄 */}
      <header className="bg-white/85 backdrop-blur shadow-sm border-b border-pink-100 sticky top-0 z-40">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setIsMobileSidebarOpen(true)}
                className="lg:hidden p-2 text-gray-600 hover:text-gray-900 hover:bg-pink-50 rounded-full"
                aria-label="開啟選單"
              >
                <Menu className="h-5 w-5" />
              </button>
              <button
                onClick={() => setIsSidebarCollapsed((prev) => !prev)}
                className="hidden lg:inline-flex p-2 text-gray-600 hover:text-gray-900 hover:bg-pink-50 rounded-full"
                aria-label="收合側邊欄"
              >
                {isSidebarCollapsed ? (
                  <PanelLeftOpen className="h-5 w-5" />
                ) : (
                  <PanelLeftClose className="h-5 w-5" />
                )}
              </button>
              <h1 className="text-xl font-bold text-gray-900">耀聖藥局</h1>
            </div>
            <div className="flex items-center gap-4">
              <span className="hidden sm:inline text-sm text-gray-600">
                {currentUser.name} ({roleLabel})
              </span>
              
              {/* 通知按鈕 */}
              <div className="relative">
                <button
                  onClick={() => setShowNotifications(!showNotifications)}
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-pink-50 rounded-full"
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
                    <div className="p-4 border-b flex items-center justify-between">
                      <h3 className="font-semibold text-gray-900">通知</h3>
                      <button
                        onClick={() => { setShowNotifications(false); router.push('/notifications'); }}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        全部查看
                      </button>
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                      {notifications
                        .filter((n) => n.userId === currentUser.id)
                        .slice(0, 10)
                        .map((notification) => {
                          // 根據通知類型自動判斷跳轉頁面
                          const autoRoute = notification.route ?? (() => {
                            if (notification.title.includes('請假')) return '/applications/leave';
                            if (notification.title.includes('加班')) return '/applications/overtime';
                            if (notification.title.includes('換班')) return '/applications/shift-swap';
                            return '/notifications';
                          })();
                          return (
                            <div
                              key={notification.id}
                              className={`p-4 border-b hover:bg-gray-50 ${!notification.read ? 'bg-blue-50' : ''}`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-gray-900 text-sm">{notification.title}</div>
                                  <div className="text-sm text-gray-600 mt-0.5 truncate">{notification.message}</div>
                                  <div className="text-xs text-gray-400 mt-1">
                                    {new Date(notification.createdAt).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                  </div>
                                </div>
                                <button
                                  onClick={() => handleNotificationClick(notification.id, autoRoute)}
                                  className="shrink-0 text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                                >
                                  查看
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      {notifications.filter((n) => n.userId === currentUser.id).length === 0 && (
                        <div className="p-4 text-center text-gray-500">沒有通知</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-900 px-2 py-1.5 rounded-full hover:bg-pink-50"
              >
                <LogOut className="h-5 w-5" />
                <span className="hidden sm:inline text-sm">登出</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* 手機側邊欄遮罩 */}
        {isMobileSidebarOpen && (
          <button
            onClick={closeMobileSidebar}
            className="lg:hidden fixed inset-0 bg-black/40 z-40"
            aria-label="關閉側邊欄遮罩"
          />
        )}

        {/* 側邊欄 */}
        <aside
          className={`fixed lg:sticky top-0 z-50 lg:z-30 h-screen bg-white/95 backdrop-blur border-r border-pink-100 shadow-sm transition-all duration-300
            ${isSidebarCollapsed ? 'lg:w-20' : 'lg:w-64'}
            ${isMobileSidebarOpen ? 'translate-x-0 w-72' : '-translate-x-full w-72 lg:translate-x-0'}
          `}
        >
          <div className="flex items-center justify-between p-4 border-b lg:hidden">
            <span className="font-semibold text-gray-900">功能選單</span>
            <button
              onClick={closeMobileSidebar}
              className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              aria-label="關閉選單"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <nav className="p-3 space-y-1 h-[calc(100vh-64px)] overflow-y-auto scrollbar-hide">
            {navItems.filter(item => item.allowed).map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={closeMobileSidebar}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-gradient-to-r from-pink-50 to-sky-50 text-sky-700 shadow-sm'
                      : 'text-gray-700 hover:bg-pink-50'
                  }`}
                  title={isSidebarCollapsed ? item.label : undefined}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  <span
                    className={`transition-opacity duration-200 ${
                      isSidebarCollapsed ? 'lg:hidden' : ''
                    }`}
                  >
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* 主要內容 */}
        <main className="flex-1 min-w-0">
          <div className="p-4 sm:p-6 lg:p-8">
            {children}
          </div>
        </main>
      </div>

      {/* 排休提醒 Modal */}
      {showLeaveReminder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full relative">
            <button
              type="button"
              onClick={dismissLeaveReminder}
              className="absolute top-3 right-3 p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
              aria-label="關閉提醒"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="flex items-start gap-3 mb-4">
              <Calendar className="h-6 w-6 text-blue-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-gray-900">記得排休下個月班表！</p>
                <p className="text-sm text-gray-600 mt-1">
                  已到每月排休提醒時間，您尚未選擇下個月的排休日期，請記得前往排休選擇頁面完成選擇。
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={dismissLeaveReminder}
                className="flex-1 py-2 border rounded-lg text-gray-600 text-sm"
              >
                本月不再提醒
              </button>
              <button
                type="button"
                onClick={() => {
                  dismissLeaveReminder();
                  router.push('/leave-selection');
                }}
                className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
              >
                前往排休選擇
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
