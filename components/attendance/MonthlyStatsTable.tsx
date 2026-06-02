'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/types';

type MonthlyStats = Database['public']['Tables']['monthly_attendance_stats']['Row'];
type User = Database['public']['Tables']['users']['Row'];

export function MonthlyStatsTable() {
  const [stats, setStats] = useState<MonthlyStats[]>([]);
  const [users, setUsers] = useState<Record<string, User>>({});
  const [currentDate, setCurrentDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [isManager, setIsManager] = useState(false);
  const supabase = createClient();

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;

  useEffect(() => {
    loadData();
  }, [currentDate]);

  const loadData = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data: currentUser } = await supabase
      .from('users')
      .select('role')
      .eq('id', session.user.id)
      .single();

    const manager = currentUser?.role === 'boss' || currentUser?.role === 'manager';
    setIsManager(manager);

    const [usersRes, statsRes] = await Promise.all([
      supabase.from('users').select('*').eq('is_active', true),
      supabase.from('monthly_attendance_stats').select('*').eq('year', year).eq('month', month),
    ]);

    if (usersRes.data) {
      const userMap: Record<string, User> = {};
      usersRes.data.forEach((u) => { userMap[u.id] = u; });
      setUsers(userMap);
    }

    let filteredStats = statsRes.data || [];
    if (!manager) {
      filteredStats = filteredStats.filter((s) => s.user_id === session.user.id);
    }
    setStats(filteredStats);
    setLoading(false);
  };

  const prevMonth = () => {
    setCurrentDate(new Date(year, currentDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, currentDate.getMonth() + 1, 1));
  };

  if (loading) {
    return (
      <div className="text-center py-12 text-gray-500">
        載入中...
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border">
      <div className="p-4 border-b flex justify-between items-center">
        <div className="flex items-center gap-4">
          <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-lg">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h2 className="text-xl font-bold text-gray-900">
            {year} 年 {month} 月 工時統計
          </h2>
          <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-lg">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {stats.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          本月尚無工時統計
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  員工
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  上班天數
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  上班時數
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  加班費時數
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  補休時數
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  請假時數
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {stats.map((stat) => (
                <tr key={stat.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {users[stat.user_id]?.name || '-'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {stat.work_days} 天
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {stat.work_hours} 小時
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {stat.overtime_hours} 小時
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {stat.comp_leave_hours} 小時
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {stat.leave_hours} 小時
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
