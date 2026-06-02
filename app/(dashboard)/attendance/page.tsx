'use client';

import { useMemo, useState } from 'react';
import { useApp } from '@/lib/context/AppContext';
import { SHIFT_HOURS } from '@/lib/attendance/calculator';

export default function AttendancePage() {
  const {
    currentUser,
    employees,
    getShiftForDate,
    overtimeRequests,
    leaveRequests,
    tardinessRecords,
  } = useApp();
  const [currentDate, setCurrentDate] = useState(new Date(2026, 5, 1));
  
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;
  const daysInMonth = new Date(year, month, 0).getDate();

  const canExport = currentUser?.role === 'owner' || currentUser?.role === 'manager';
  const targetEmployees = employees.filter((emp) => emp.role !== 'owner');
  const displayEmployees = canExport
    ? targetEmployees
    : targetEmployees.filter((emp) => emp.id === currentUser?.id);

  const stats = useMemo(() => {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

    return displayEmployees.map((emp) => {
      let workDays = 0;
      let workHours = 0;

      for (let day = 1; day <= daysInMonth; day += 1) {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const shift = getShiftForDate(dateStr, emp.id);
        if (shift !== 'X') {
          workDays += 1;
        }
        workHours += SHIFT_HOURS[shift] ?? 0;
      }

      const overtimeHours = overtimeRequests
        .filter((item) => item.employeeId === emp.id && item.status === 'approved')
        .filter((item) => item.date >= startDate && item.date <= endDate)
        .filter((item) => item.compensationType === 'pay')
        .reduce((sum, item) => {
          const [sh, sm] = item.startTime.split(':').map(Number);
          const [eh, em] = item.endTime.split(':').map(Number);
          return sum + ((eh * 60 + em) - (sh * 60 + sm)) / 60;
        }, 0);

      const compensatoryHours = overtimeRequests
        .filter((item) => item.employeeId === emp.id && item.status === 'approved')
        .filter((item) => item.date >= startDate && item.date <= endDate)
        .filter((item) => item.compensationType === 'time_off')
        .reduce((sum, item) => {
          const [sh, sm] = item.startTime.split(':').map(Number);
          const [eh, em] = item.endTime.split(':').map(Number);
          return sum + ((eh * 60 + em) - (sh * 60 + sm)) / 60;
        }, 0);

      const leaveHours = leaveRequests
        .filter((item) => item.employeeId === emp.id && item.status === 'approved')
        .filter((item) => item.date >= startDate && item.date <= endDate)
        .reduce((sum, item) => sum + (item.period === '全天' ? 8 : 4), 0);

      const tardy = tardinessRecords
        .filter((item) => item.employeeId === emp.id)
        .filter((item) => item.date >= startDate && item.date <= endDate);

      const tardyCount = tardy.length;
      const tardyMinutes = tardy.reduce((sum, item) => sum + item.minutes, 0);

      return {
        id: emp.id,
        name: emp.name,
        workDays,
        workHours: Number(workHours.toFixed(2)),
        overtimeHours: Number(overtimeHours.toFixed(2)),
        compensatoryHours: Number(compensatoryHours.toFixed(2)),
        leaveHours: Number(leaveHours.toFixed(2)),
        tardyCount,
        tardyMinutes,
      };
    });
  }, [daysInMonth, displayEmployees, getShiftForDate, leaveRequests, month, overtimeRequests, tardinessRecords, year]);

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 2, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month, 1));
  };

  const exportExcelReport = () => {
    const header = [
      '員工',
      '上班天數',
      '上班時數',
      '加班費時數',
      '補休時數',
      '請假時數',
      '遲到次數',
      '遲到分鐘數',
    ];
    const rows = stats.map((item) => [
      item.name,
      item.workDays,
      item.workHours,
      item.overtimeHours,
      item.compensatoryHours,
      item.leaveHours,
      item.tardyCount,
      item.tardyMinutes,
    ]);

    const csv = [header, ...rows].map((row) => row.join(',')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `工時與遲到報表-${year}-${String(month).padStart(2, '0')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={prevMonth} className="p-2 border rounded hover:bg-gray-50">◀</button>
          <h2 className="text-2xl font-bold text-gray-900">{year}年{month}月 工時統計</h2>
          <button onClick={nextMonth} className="p-2 border rounded hover:bg-gray-50">▶</button>
        </div>
        {canExport && (
          <button onClick={exportExcelReport} className="app-btn-primary">
            匯出 Excel 報表
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-4 text-left text-sm font-medium text-gray-700">員工</th>
              <th className="p-4 text-center text-sm font-medium text-gray-700">上班天數</th>
              <th className="p-4 text-center text-sm font-medium text-gray-700">上班時數</th>
              <th className="p-4 text-center text-sm font-medium text-gray-700">加班費</th>
              <th className="p-4 text-center text-sm font-medium text-gray-700">補休</th>
              <th className="p-4 text-center text-sm font-medium text-gray-700">請假</th>
              <th className="p-4 text-center text-sm font-medium text-gray-700">遲到次數</th>
              <th className="p-4 text-center text-sm font-medium text-gray-700">遲到分鐘</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {stats.map((stat) => (
              <tr key={stat.id} className="hover:bg-gray-50">
                <td className="p-4 text-left font-medium text-gray-900">{stat.name}</td>
                <td className="p-4 text-center text-gray-600">{stat.workDays}天</td>
                <td className="p-4 text-center text-gray-600">{stat.workHours}小時</td>
                <td className="p-4 text-center text-blue-600 font-medium">{stat.overtimeHours}小時</td>
                <td className="p-4 text-center text-green-600 font-medium">{stat.compensatoryHours}小時</td>
                <td className="p-4 text-center text-red-600 font-medium">{stat.leaveHours}小時</td>
                <td className="p-4 text-center text-amber-700 font-medium">{stat.tardyCount}次</td>
                <td className="p-4 text-center text-amber-700 font-medium">{stat.tardyMinutes}分</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
