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
  Store,
} from 'lucide-react';
import Link from 'next/link';
import LoginPopupStack from '@/components/LoginPopupStack';
import { SITE_IDS, SITES, SYSTEM_NAME, type SiteId } from '@/lib/sites';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const {
    currentUser,
    logout,
    notifications,
    markNotificationRead,
    deleteNotification,
    deleteAllNotifications,
    refreshNotifications,
    isLoading,
    storeConfig,
    activeSiteId,
    setActiveSite,
    canSwitchSite,
  } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const [showNotifications, setShowNotifications] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [switchingSite, setSwitchingSite] = useState(false);

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
      <div className="min-h-screen flex items-center justify-center app-shell">
        <div className="app-panel px-8 py-6 text-slate-500 app-fade-in">載入中...</div>
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
    {
      href: '/wednesday-shifts',
      label: storeConfig.rotationEvening.menuLabel,
      icon: MoonStar,
      allowed: storeConfig.features.rotationEvening,
    },
    { href: '/applications/leave', label: '請假申請', icon: FileText, allowed: true },
    { href: '/applications/shift-swap', label: '換班申請', icon: Repeat, allowed: true },
    { href: '/applications/overtime', label: '加班申請', icon: Clock, allowed: true },
    { href: '/attendance', label: '工時統計', icon: TrendingUp, allowed: true },
    { href: '/attendance/tardiness', label: '遲到管理', icon: Clock, allowed: isManager },
    { href: '/employees', label: '員工管理', icon: UserPlus, allowed: isManager },
    { href: '/store-settings', label: '店家設定', icon: Settings, allowed: isManager },
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

  const handleSiteChange = async (next: SiteId) => {
    if (next === activeSiteId || switchingSite) return;
    setSwitchingSite(true);
    try {
      await setActiveSite(next);
    } catch (err) {
      alert(err instanceof Error ? err.message : '切換店別失敗');
    } finally {
      setSwitchingSite(false);
    }
  };

  const closeMobileSidebar = () => {
    setIsMobileSidebarOpen(false);
  };

  const roleLabel = 
    currentUser.role === 'owner' ? '老闆' : 
    currentUser.role === 'manager' ? '店長' : '員工';

  const storeLabel =
    storeConfig.storeName?.trim() || SITES[activeSiteId].displayName;

  return (
    <div className="h-dvh flex flex-col app-shell relative overflow-hidden">
      {/* 頂部導航欄 */}
      <header className="app-glass shrink-0 z-40 relative">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3 sm:gap-4 min-w-0">
              <button
                onClick={() => setIsMobileSidebarOpen(true)}
                className="lg:hidden p-2 text-slate-600 hover:text-slate-900 hover:bg-sky-50 rounded-xl shrink-0"
                aria-label="開啟選單"
              >
                <Menu className="h-5 w-5" />
              </button>
              <button
                onClick={() => setIsSidebarCollapsed((prev) => !prev)}
                className="hidden lg:inline-flex p-2 text-slate-600 hover:text-slate-900 hover:bg-sky-50 rounded-xl shrink-0"
                aria-label="收合側邊欄"
              >
                {isSidebarCollapsed ? (
                  <PanelLeftOpen className="h-5 w-5" />
                ) : (
                  <PanelLeftClose className="h-5 w-5" />
                )}
              </button>
              <div className="min-w-0">
                <h1 className="text-base sm:text-xl font-semibold tracking-tight text-slate-900 truncate">
                  <span className="bg-gradient-to-r from-sky-700 to-cyan-600 bg-clip-text text-transparent">
                    {SYSTEM_NAME}
                  </span>
                </h1>
                <p className="text-xs text-slate-500 truncate sm:hidden">
                  {storeLabel}
                </p>
              </div>
              {canSwitchSite ? (
                <label className="hidden sm:flex items-center gap-2 shrink-0 ml-1">
                  <Store className="h-4 w-4 text-sky-700" aria-hidden />
                  <select
                    value={activeSiteId}
                    disabled={switchingSite}
                    onChange={(e) => void handleSiteChange(e.target.value as SiteId)}
                    className="text-sm border border-sky-200/80 bg-white/80 text-sky-900 rounded-xl px-2.5 py-1.5 font-medium disabled:opacity-60"
                    aria-label="選擇店別"
                  >
                    {SITE_IDS.map((id) => (
                      <option key={id} value={id}>
                        {SITES[id].displayName}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-sky-800 bg-sky-50/90 border border-sky-100 rounded-full px-3 py-1 shrink-0">
                  <Store className="h-3.5 w-3.5" aria-hidden />
                  {storeLabel}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              {canSwitchSite && (
                <label className="sm:hidden flex items-center shrink-0">
                  <select
                    value={activeSiteId}
                    disabled={switchingSite}
                    onChange={(e) => void handleSiteChange(e.target.value as SiteId)}
                    className="max-w-[7.5rem] text-xs border border-sky-200 bg-white/90 text-sky-900 rounded-xl px-2 py-1.5 font-medium"
                    aria-label="選擇店別"
                  >
                    {SITE_IDS.map((id) => (
                      <option key={id} value={id}>
                        {SITES[id].name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <span className="hidden sm:inline-flex items-center gap-2 text-sm text-slate-600 bg-white/70 border border-slate-200/80 rounded-full px-3 py-1">
                <span className="font-medium text-slate-800">{currentUser.name}</span>
                <span className="text-slate-400">·</span>
                <span>{roleLabel}</span>
              </span>
              
              {/* 通知按鈕 */}
              <div className="relative">
                <button
                  onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-2 text-slate-600 hover:text-slate-900 hover:bg-sky-50 rounded-xl"
                >
                  <Bell className="h-5 w-5" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 bg-rose-500 text-white text-[11px] font-semibold rounded-full h-5 min-w-5 px-1 flex items-center justify-center shadow-sm">
                      {unreadCount}
                    </span>
                  )}
                </button>
                
                {/* 通知下拉選單 */}
                {showNotifications && (
                  <div className="fixed inset-x-3 top-16 z-50 sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-80 max-h-[min(28rem,70dvh)] app-panel overflow-hidden flex flex-col app-rise-in">
                    <div className="p-3 sm:p-4 border-b border-slate-100 flex items-center justify-between gap-2 shrink-0 bg-gradient-to-r from-sky-50/80 to-white">
                      <h3 className="font-semibold text-slate-900">通知</h3>
                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        {notifications.filter((n) => n.userId === currentUser.id).length > 0 && (
                          <button
                            type="button"
                            onClick={() => void handleDeleteAllNotifications()}
                            className="min-h-10 px-3 py-2 text-sm text-rose-700 bg-rose-50 rounded-xl hover:bg-rose-100"
                          >
                            一鍵刪除
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => { setShowNotifications(false); router.push('/notifications'); }}
                          className="min-h-10 px-3 py-2 text-sm text-sky-800 bg-sky-50 rounded-xl hover:bg-sky-100"
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
                              className={`p-3 sm:p-4 border-b border-slate-100 hover:bg-sky-50/40 ${!notification.read ? 'bg-sky-50/70' : ''}`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-slate-900 text-sm">{notification.title}</div>
                                  <div className="text-sm text-slate-600 mt-0.5 line-clamp-2">{notification.message}</div>
                                  <div className="text-xs text-slate-400 mt-1">
                                    {new Date(notification.createdAt).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                  </div>
                                </div>
                                <div className="flex flex-col gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => handleNotificationClick(notification.id, autoRoute)}
                                    className="min-h-10 px-3 py-2 text-sm bg-sky-600 text-white rounded-xl hover:bg-sky-700"
                                  >
                                    查看
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void deleteNotification(notification.id).catch(() => alert('刪除失敗，請稍後再試。'))}
                                    className="min-h-10 px-3 py-2 text-sm bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-100"
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
                        <div className="p-8 text-center text-slate-500 text-sm">沒有通知</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 text-slate-600 hover:text-slate-900 px-2.5 py-1.5 rounded-xl hover:bg-sky-50"
              >
                <LogOut className="h-5 w-5" />
                <span className="hidden sm:inline text-sm">登出</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* 左目錄／右內容雙欄獨立：目錄固定貫穿，只有右邊頁面捲動 */}
      <div className="flex flex-1 min-h-0 relative z-10">
        {/* 手機側邊欄遮罩 */}
        {isMobileSidebarOpen && (
          <button
            onClick={closeMobileSidebar}
            className="lg:hidden fixed inset-0 bg-slate-900/40 z-40"
            aria-label="關閉側邊欄遮罩"
          />
        )}

        <aside
          className={`app-sidebar z-50 flex flex-col
            fixed inset-y-0 left-0 w-72
            lg:static lg:inset-auto lg:h-full lg:shrink-0 lg:transform-none
            transition-[width] duration-300 ease-out max-lg:transition-transform
            ${isSidebarCollapsed ? 'lg:w-20' : 'lg:w-64'}
            ${isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          `}
        >
          <div className="flex items-center justify-between p-4 border-b border-slate-100 lg:hidden shrink-0">
            <span className="font-semibold text-slate-900 text-base">功能選單</span>
            <button
              onClick={closeMobileSidebar}
              className="p-2 text-slate-600 hover:bg-sky-50 rounded-xl"
              aria-label="關閉選單"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <nav className="flex-1 min-h-0 app-scroll-pane p-3 space-y-1.5 scrollbar-hide">
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
                    className={`app-nav-link ${isActive ? 'app-nav-link-active' : ''}`}
                    title={isSidebarCollapsed ? item.label : undefined}
                  >
                    <span
                      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                        isActive
                          ? 'bg-sky-100 text-sky-700'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <span
                      className={`app-nav-label ${
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

        {/* 右邊頁面獨立捲動；左邊目錄保持固定可見、隨時可點 */}
        <main className="flex-1 min-w-0 min-h-0 app-scroll-pane bg-transparent">
          <div className="p-3 sm:p-6 lg:p-8 max-w-full">
            {children}
          </div>
        </main>
      </div>

      {/* 登入彈窗堆疊：公告（僅 active）／薪資／排休提醒 */}
      <LoginPopupStack />
    </div>
  );
}
