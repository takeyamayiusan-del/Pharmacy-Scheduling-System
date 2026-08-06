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
import LoginPopupStack from '@/components/LoginPopupStack';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { currentUser, logout, notifications, markNotificationRead, deleteNotification, deleteAllNotifications, refreshNotifications, isLoading } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const [showNotifications, setShowNotifications] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

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
    { href: '/notifications', label: '通知中心', icon: Bell, allowed: true },
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

  const handleDeleteAllNotifications = async () => {
    if (!window.confirm('確定刪除全部通知？此動作無法復原。')) return;
    try {
      await deleteAllNotifications();
    } catch {
      alert('刪除失敗，請稍後再試。');
    }
  };

  const handleNotificationClick = (notificationId: string, route?: string) => {
    markNotificationRead(notificationId);
    setShowNotifications(false);
    if (route) {
      router.push(route);
      return;
    }
    router.push('/notifications');
  };

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
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
                  <div className="fixed inset-x-3 top-16 z-50 sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-80 max-h-[min(28rem,70dvh)] bg-white rounded-lg shadow-lg border overflow-hidden flex flex-col">
                    <div className="p-3 sm:p-4 border-b flex items-center justify-between gap-2 shrink-0">
                      <h3 className="font-semibold text-gray-900">通知</h3>
                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        {notifications.filter((n) => n.userId === currentUser.id).length > 0 && (
                          <button
                            type="button"
                            onClick={() => void handleDeleteAllNotifications()}
                            className="min-h-10 px-3 py-2 text-sm text-red-700 bg-red-50 rounded-lg hover:bg-red-100"
                          >
                            一鍵刪除
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => { setShowNotifications(false); router.push('/notifications'); }}
                          className="min-h-10 px-3 py-2 text-sm text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100"
                        >
                          全部查看
                        </button>
                      </div>
                    </div>
                    <div className="overflow-y-auto flex-1">
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
                              className={`p-3 sm:p-4 border-b hover:bg-gray-50 ${!notification.read ? 'bg-blue-50' : ''}`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-gray-900 text-sm">{notification.title}</div>
                                  <div className="text-sm text-gray-600 mt-0.5 line-clamp-2">{notification.message}</div>
                                  <div className="text-xs text-gray-400 mt-1">
                                    {new Date(notification.createdAt).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                  </div>
                                </div>
                                <div className="flex flex-col gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => handleNotificationClick(notification.id, autoRoute)}
                                    className="min-h-10 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                                  >
                                    查看
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void deleteNotification(notification.id).catch(() => alert('刪除失敗，請稍後再試。'))}
                                    className="min-h-10 px-3 py-2 text-sm bg-red-100 text-red-600 rounded-lg hover:bg-red-200"
                                    aria-label="刪除通知"
                                  >
                                    刪除
                                  </button>
                                </div>
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
            {(() => {
              const visibleNav = navItems.filter((item) => item.allowed);
              // 只亮「路徑最長／最精確」的那一項，避免 /attendance/punch-admin 連工時統計一起亮
              const activeHref =
                visibleNav
                  .filter(
                    (item) =>
                      pathname === item.href || pathname.startsWith(`${item.href}/`)
                  )
                  .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;

              return visibleNav.map((item) => {
                const Icon = item.icon;
                const isActive = item.href === activeHref;
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
              });
            })()}
          </nav>
        </aside>

        {/* 主要內容：min-w-0 + overflow 避免手機左右被撐破 */}
        <main className="flex-1 min-w-0 overflow-x-hidden">
          <div className="p-3 sm:p-6 lg:p-8 max-w-full overflow-x-hidden">
            {children}
          </div>
        </main>
      </div>

      {/* 登入彈窗堆疊：公告（僅 active）／薪資／排休提醒 */}
      <LoginPopupStack />
    </div>
  );
}
