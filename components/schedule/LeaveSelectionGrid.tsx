'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ShiftCell } from './ShiftCell';
import { validateLeaveSelection } from '@/lib/scheduling/rules';
import type { Database, LeaveSelectionContext, SchedulingRules } from '@/lib/types';
import { ChevronLeft, ChevronRight, Info } from 'lucide-react';

type User = Database['public']['Tables']['users']['Row'];
type ScheduleEntry = Database['public']['Tables']['schedule_entries']['Row'];
type ScheduleLock = Database['public']['Tables']['schedule_locks']['Row'];

const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

export function LeaveSelectionGrid() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [scheduleEntries, setScheduleEntries] = useState<ScheduleEntry[]>([]);
  const [scheduleLocks, setScheduleLocks] = useState<ScheduleLock[]>([]);
  const [rules, setRules] = useState<SchedulingRules | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const supabase = createClient();

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();

  const loadData = useCallback(async () => {
    setLoading(true);
    const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${daysInMonth}`;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const [currentUserRes, usersRes, entriesRes, locksRes, rulesRes] = await Promise.all([
      supabase.from('users').select('*').eq('id', session.user.id).single(),
      supabase.from('users').select('*').eq('is_active', true).order('name'),
      supabase.from('schedule_entries').select('*').gte('date', startDate).lte('date', endDate),
      supabase.from('schedule_locks').select('*')
        .or(`lock_type.eq.day,lock_type.eq.month,lock_type.eq.week`)
        .or(`lock_year.is.null,lock_year.eq.${year}`)
        .or(`lock_month.is.null,lock_month.eq.${month + 1}`),
      supabase.from('scheduling_rules').select('*').limit(1).single(),
    ]);

    if (currentUserRes.data) setCurrentUser(currentUserRes.data);
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

  const getUserStats = useMemo(() => {
    return (userId: string) => {
      const userEntries = scheduleEntries.filter(e => e.user_id === userId);
      const saturdayLeaves = userEntries.filter(e => {
        const date = new Date(e.date);
        return date.getDay() === 6 && e.shift_code === 'X';
      }).length;
      const weekdayLeaves = userEntries.filter(e => {
        const date = new Date(e.date);
        const dayOfWeek = date.getDay();
        return dayOfWeek >= 1 && dayOfWeek <= 5 && e.shift_code === 'X';
      }).length;
      return { saturdayLeaves, weekdayLeaves };
    };
  }, [scheduleEntries]);

  const getEntry = (userId: string, dateStr: string) => {
    return scheduleEntries.find(e => e.user_id === userId && e.date === dateStr);
  };

  const handleToggleLeave = async (user: User, dateStr: string) => {
    if (!rules || !currentUser) return;

    const date = new Date(dateStr);
    const currentEntry = getEntry(user.id, dateStr);
    const stats = getUserStats(user.id);
    const isCurrentlyLeave = currentEntry?.shift_code === 'X';

    if (!isCurrentlyLeave) {
      const context: LeaveSelectionContext = {
        employeeId: user.id,
        employeeName: user.name,
        year,
        month: month + 1,
        existingSaturdayLeaves: stats.saturdayLeaves,
        existingWeekdayLeaves: stats.weekdayLeaves,
        targetDate: date,
        rules,
      };

      const validation = validateLeaveSelection(context);
      if (!validation.valid) {
        setMessage({ text: validation.error!, type: 'error' });
        setTimeout(() => setMessage(null), 3000);
        return;
      }
    }

    if (isDateLocked(dateStr)) {
      setMessage({ text: '此日期已鎖定，無法修改', type: 'error' });
      setTimeout(() => setMessage(null), 3000);
      return;
    }

    if (currentEntry?.is_fixed) {
      setMessage({ text: '此為固定班表，無法修改', type: 'error' });
      setTimeout(() => setMessage(null), 3000);
      return;
    }

    const newShiftCode = isCurrentlyLeave ? 'A' : 'X';

    try {
      if (currentEntry) {
        const { error } = await supabase
          .from('schedule_entries')
          .update({ shift_code: newShiftCode })
          .eq('id', currentEntry.id);

        if (error) throw error;

        setScheduleEntries(prev =>
          prev.map(e => e.id === currentEntry.id ? { ...e, shift_code: newShiftCode } : e)
        );
      } else {
        const { error } = await supabase
          .from('schedule_entries')
          .insert({
            user_id: user.id,
            date: dateStr,
            shift_code: newShiftCode,
            is_fixed: false,
          });

        if (error) throw error;

        const { data: newEntry } = await supabase
          .from('schedule_entries')
          .select('*')
          .eq('user_id', user.id)
          .eq('date', dateStr)
          .single();

        if (newEntry) {
          setScheduleEntries(prev => [...prev, newEntry]);
        }
      }

      setMessage({ text: '排休已更新', type: 'success' });
      setTimeout(() => setMessage(null), 3000);
    } catch {
      setMessage({ text: '更新失敗', type: 'error' });
      setTimeout(() => setMessage(null), 3000);
    }
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

  const isManager = currentUser?.role === 'boss' || currentUser?.role === 'manager';
  const displayUsers = isManager ? users : (currentUser ? [currentUser] : []);

  return (
    <div className="app-panel">
      {/* 標題與導航 */}
      <div className="p-4 border-b flex justify-between items-center">
        <div className="flex items-center gap-4">
          <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-lg">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h2 className="text-xl font-bold text-gray-900">
            {year} 年 {month + 1} 月 排休選擇
          </h2>
          <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-lg">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* 提示訊息 */}
      {message && (
        <div className={`p-4 border-b ${
          message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>
          {message.text}
        </div>
      )}

      {/* 使用說明 */}
      <div className="p-4 border-b bg-blue-50">
        <div className="flex items-start gap-2">
          <Info className="h-5 w-5 text-blue-600 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-medium">排休規則：</p>
            <ul className="list-disc list-inside mt-1">
              <li>週日為固定休假，無法選擇</li>
              <li>每月可選擇 2 天週六休假</li>
              <li>每月可選擇 2 天平日休假</li>
              {(currentUser as { is_weekday_off_rule?: boolean } | null)?.is_weekday_off_rule && (
                <li>平日不排休：僅能選擇週六休假</li>
              )}
            </ul>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-white p-3 text-left text-sm font-medium text-gray-700 border-b w-32">
                員工
              </th>
              {Array.from({ length: daysInMonth }, (_, i) => {
                const day = i + 1;
                const dayOfWeek = (firstDay + i) % 7;
                const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

                return (
                  <th
                    key={day}
                    className={`p-3 text-center text-sm font-medium border-b min-w-[50px] ${
                      isWeekend ? 'bg-gray-50' : ''
                    }`}
                  >
                    <div className="flex flex-col items-center">
                      <span>{day}</span>
                      <span className="text-xs text-gray-500">{weekDays[dayOfWeek]}</span>
                    </div>
                  </th>
                );
              })}
              <th className="p-3 text-center text-sm font-medium text-gray-700 border-b w-40">
                剩餘配額
              </th>
            </tr>
          </thead>
          <tbody>
            {displayUsers.map((user) => {
              const stats = getUserStats(user.id);
              const saturdayRemaining = (rules?.saturday_leave_quota || 2) - stats.saturdayLeaves;
              const weekdayRemaining = (rules?.weekday_leave_quota || 2) - stats.weekdayLeaves;
              const canEdit = user.id === currentUser?.id || isManager;

              return (
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
                          editable={canEdit}
                          onClick={() => handleToggleLeave(user, dateStr)}
                        />
                      </td>
                    );
                  })}
                  <td className="p-3 text-center text-sm border-b">
                    <div className="space-y-1">
                      <span className={saturdayRemaining <= 0 ? 'text-red-600' : 'text-gray-700'}>
                        週六: {saturdayRemaining}/{rules?.saturday_leave_quota || 2}
                      </span>
                      <br />
                      {user.name !== '聖文' && (
                        <span className={weekdayRemaining <= 0 ? 'text-red-600' : 'text-gray-700'}>
                          平日: {weekdayRemaining}/{rules?.weekday_leave_quota || 2}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
