'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ShiftCell } from './ShiftCell';
import { StaffingAlert } from './StaffingAlert';
import { calculateEveningStaffingStatus, isEveningShift } from '@/lib/scheduling/staffing';
import { useApp } from '@/lib/context/AppContext';
import type { Database } from '@/lib/supabase/types';
import { ChevronLeft, ChevronRight, Lock } from 'lucide-react';

type User = Database['public']['Tables']['users']['Row'];
type ScheduleEntry = Database['public']['Tables']['schedule_entries']['Row'];
type ScheduleLock = Database['public']['Tables']['schedule_locks']['Row'];
type SchedulingRules = Database['public']['Tables']['scheduling_rules']['Row'];

interface MonthlyCalendarProps {
  editable?: boolean;
}

const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

export function MonthlyCalendar({ editable = false }: MonthlyCalendarProps) {
  const { storeConfig, shiftTimeConfig } = useApp();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [users, setUsers] = useState<User[]>([]);
  const [scheduleEntries, setScheduleEntries] = useState<ScheduleEntry[]>([]);
  const [scheduleLocks, setScheduleLocks] = useState<ScheduleLock[]>([]);
  const [rules, setRules] = useState<SchedulingRules | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();

  const loadData = useCallback(async () => {
    setLoading(true);
    const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${daysInMonth}`;

    const [usersRes, entriesRes, locksRes, rulesRes] = await Promise.all([
      supabase.from('users').select('*').eq('is_active', true).order('name'),
      supabase.from('schedule_entries').select('*').gte('date', startDate).lte('date', endDate),
      supabase.from('schedule_locks').select('*')
        .or(`lock_type.eq.day,lock_type.eq.month,lock_type.eq.week`)
        .or(`lock_year.is.null,lock_year.eq.${year}`)
        .or(`lock_month.is.null,lock_month.eq.${month + 1}`),
      supabase.from('scheduling_rules').select('*').limit(1).single(),
    ]);

    if (usersRes.data) setUsers(usersRes.data);
    if (entriesRes.data) setScheduleEntries(entriesRes.data);
    if (locksRes.data) setScheduleLocks(locksRes.data);
    if (rulesRes.data) setRules(rulesRes.data);
    setLoading(false);
  }, [daysInMonth, month, supabase, year]);

  useEffect(() => {
    loadData();
  }, [currentDate, loadData]);

  const isDateLocked = useMemo(() => {
    return (dateStr: string) => {
      const date = new Date(dateStr);
      const weekNumber = Math.ceil((date.getDate() + 6 - date.getDay()) / 7);

      return scheduleLocks.some(lock => {
        if (lock.lock_type === 'day' && lock.lock_date === dateStr) return true;
        if (lock.lock_type === 'week' && lock.lock_year === year && lock.lock_week === weekNumber) return true;
        if (lock.lock_type === 'month' && lock.lock_year === year && lock.lock_month === month + 1) return true;
        return false;
      });
    };
  }, [scheduleLocks, year, month]);

  const getEveningStaffingStatus = useMemo(() => {
    return (dateStr: string) => {
      const entries = scheduleEntries.filter(e => e.date === dateStr);
      const eveningCount = entries.filter(e =>
        isEveningShift(e.shift_code, storeConfig, shiftTimeConfig)
      ).length;
      return calculateEveningStaffingStatus(eveningCount, rules?.min_evening_staff || 2);
    };
  }, [scheduleEntries, rules, storeConfig, shiftTimeConfig]);

  const getEntry = (userId: string, dateStr: string) => {
    return scheduleEntries.find(e => e.user_id === userId && e.date === dateStr);
  };

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  if (loading) {
    return (
      <div className="text-center py-12 text-gray-500">
        載入中...
      </div>
    );
  }

  return (
    <div className="app-panel">
      {/* 標題與導航 */}
      <div className="p-4 border-b flex justify-between items-center">
        <div className="flex items-center gap-4">
          <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-lg">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h2 className="text-xl font-bold text-gray-900">
            {year} 年 {month + 1} 月
          </h2>
          <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-lg">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-white p-3 text-left text-sm font-medium text-gray-700 border-b w-24">
                員工
              </th>
              {Array.from({ length: daysInMonth }, (_, i) => {
                const day = i + 1;
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const dayOfWeek = (firstDay + i) % 7;
                const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                const locked = isDateLocked(dateStr);

                return (
                  <th
                    key={day}
                    className={`p-3 text-center text-sm font-medium border-b min-w-[60px] ${
                      isWeekend ? 'bg-gray-50' : ''
                    }`}
                  >
                    <div className="flex flex-col items-center gap-1">
                      <span>{day}</span>
                      <span className="text-xs text-gray-500">{weekDays[dayOfWeek]}</span>
                      {locked && <Lock className="h-3 w-3 text-gray-400" />}
                    </div>
                  </th>
                );
              })}
            </tr>
            {/* 人力警示列 */}
            <tr>
              <th className="sticky left-0 z-10 bg-white p-2 text-xs text-gray-500 border-b">
                晚班人力
              </th>
              {Array.from({ length: daysInMonth }, (_, i) => {
                const day = i + 1;
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const dayOfWeek = (firstDay + i) % 7;
                const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

                return (
                  <th
                    key={day}
                    className={`p-2 text-center border-b ${isWeekend ? 'bg-gray-50' : ''}`}
                  >
                    <StaffingAlert status={getEveningStaffingStatus(dateStr)} />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-gray-50">
                <td className="sticky left-0 z-10 bg-white p-3 text-sm font-medium text-gray-900 border-b">
                  {user.name}
                </td>
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const day = i + 1;
                  const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const dayOfWeek = (firstDay + i) % 7;
                  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                  const entry = getEntry(user.id, dateStr);
                  const locked = isDateLocked(dateStr);

                  return (
                    <td
                      key={day}
                      className={`p-2 border-b ${isWeekend ? 'bg-gray-50' : ''}`}
                    >
                      <ShiftCell
                        shiftCode={entry?.shift_code || 'A'}
                        isFixed={entry?.is_fixed}
                        isLocked={locked}
                        editable={editable}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 班表圖例 */}
      <div className="p-4 border-t">
        <div className="flex flex-wrap gap-4 text-sm">
          <span className="text-gray-600 font-medium">班表圖例：</span>
          {(['A', 'B', 'C', 'D', 'E', 'X'] as const).map((code) => (
            <div key={code} className="flex items-center gap-2">
              <ShiftCell shiftCode={code} />
              <span className="text-gray-600">
                {code === 'A' ? '全天' : code === 'B' ? '白班' : code === 'C' ? '上午班' : code === 'D' ? '下午班' : code === 'E' ? '下午+晚班' : '休假'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
