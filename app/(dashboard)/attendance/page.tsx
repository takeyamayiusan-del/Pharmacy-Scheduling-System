'use client';

import { useMemo, useState } from 'react';
import { useApp } from '@/lib/context/AppContext';
import { SHIFT_HOURS } from '@/lib/attendance/calculator';
import {
  calculateApprovedLeaveHoursOnDate,
  calculateApprovedLeaveHoursTotal,
} from '@/lib/attendance/leaveHours';
import { buildEffectiveTardinessRecords } from '@/lib/tardiness';
import { Download, FileText, Calendar, Clock } from 'lucide-react';
import jsPDF from 'jspdf';

export default function AttendancePage() {
  const {
    currentUser,
    employees,
    getShiftForDate,
    getHolidayInfo,
    shiftTimeConfig,
    overtimeRequests,
    leaveRequests,
    tardinessRecords,
    punchRecords,
  } = useApp();
  const [currentDate, setCurrentDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [showMonthlyDetail, setShowMonthlyDetail] = useState(false);
  
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;
  const daysInMonth = new Date(year, month, 0).getDate();

  const canExport = currentUser?.role === 'owner' || currentUser?.role === 'manager';
  const targetEmployees = employees.filter((emp) => emp.role !== 'owner');
  const displayEmployees = canExport
    ? targetEmployees
    : targetEmployees.filter((emp) => emp.id === currentUser?.id);

  const isDateInMonth = (dateValue: string, year: number, month: number) => {
    const match = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return false;
    return Number(match[1]) === year && Number(match[2]) === month;
  };

  const stats = useMemo(() => {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

    return displayEmployees.map((emp) => {
      let workDays = 0;
      let workHours = 0;

      let holidayOvertimeHours = 0;

      for (let day = 1; day <= daysInMonth; day += 1) {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const shift = getShiftForDate(dateStr, emp.id);
        const shiftHours = SHIFT_HOURS[shift] ?? 0;
        const leaveHoursOnDay = calculateApprovedLeaveHoursOnDate(
          dateStr,
          emp.id,
          leaveRequests,
          getShiftForDate,
          shiftTimeConfig
        );
        const creditedWorkHours = Math.max(0, shiftHours - leaveHoursOnDay);

        if (shift !== 'X' && leaveHoursOnDay < shiftHours) {
          workDays += 1;
          if (getHolidayInfo(dateStr).isHoliday) {
            holidayOvertimeHours += creditedWorkHours;
          }
        }

        workHours += creditedWorkHours;
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
        .filter((item) => item.endDate >= startDate && item.startDate <= endDate)
        .reduce(
          (sum, item) =>
            sum +
            calculateApprovedLeaveHoursTotal(item, getShiftForDate, shiftTimeConfig),
          0
        );

      const effectiveTardinessRecords = buildEffectiveTardinessRecords(
        tardinessRecords,
        punchRecords,
        overtimeRequests
      );

      const tardy = effectiveTardinessRecords
        .filter((item) => item.employeeId === emp.id)
        .filter((item) => isDateInMonth(item.date, year, month));

      const tardyCount = tardy.length;
      const tardyMinutes = tardy.reduce((sum, item) => sum + item.minutes, 0);

      return {
        id: emp.id,
        name: emp.name,
        workDays,
        workHours: Number(workHours.toFixed(2)),
        overtimeHours: Number(overtimeHours.toFixed(2)),
        holidayOvertimeHours: Number(holidayOvertimeHours.toFixed(2)),
        compensatoryHours: Number(compensatoryHours.toFixed(2)),
        leaveHours: Number(leaveHours.toFixed(2)),
        tardyCount,
        tardyMinutes,
      };
    });
  }, [daysInMonth, displayEmployees, getShiftForDate, getHolidayInfo, leaveRequests, month, overtimeRequests, shiftTimeConfig, tardinessRecords, punchRecords, year]);

  // 產生每月打卡明細數據
  const monthlyPunchData = useMemo(() => {
    return displayEmployees.map((emp) => {
      const employeePunches = punchRecords
        .filter((p) => p.employeeId === emp.id)
        .filter((p) => isDateInMonth(p.date, year, month))
        .sort((a, b) => {
          if (a.date !== b.date) return a.date.localeCompare(b.date);
          return a.time.localeCompare(b.time);
        });
      
      // 按日期分組
      const byDate: Record<string, typeof employeePunches> = {};
      employeePunches.forEach((p) => {
        if (!byDate[p.date]) byDate[p.date] = [];
        byDate[p.date].push(p);
      });
      
      return {
        id: emp.id,
        name: emp.name,
        byDate,
      };
    });
  }, [displayEmployees, punchRecords, year, month]);

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
      '國定假日加班',
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
      item.holidayOvertimeHours,
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

  // 匯出整月打卡明細 PDF
  const exportMonthlyPunchPdf = () => {
    // 頁面尺寸
    const pageWidth = 842; // A4 landscape
    const pageHeight = 595;
    const marginLeft = 20;
    const marginTop = 30;
    const lineHeight = 16;
    const colWidths = [50, 35, 40, 120]; // 日期, 星期, 班別, 打卡時間
    
    const dayLabels = ['日', '一', '二', '三', '四', '五', '六'];
    
    // 創建 PDF
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'pt',
      format: 'a4'
    });
    
    let currentY = marginTop;
    let pageCount = 0;
    
    // 繪製標題
    const drawTitle = () => {
      currentY = marginTop;
      pageCount++;
      if (pageCount > 1) {
        pdf.addPage();
      }
      pdf.setFillColor(5, 150, 105); // emerald-600
      pdf.rect(0, 0, pageWidth, 40, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(16);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`${year} 年 ${month} 月 打卡記錄明細`, pageWidth / 2, 26, { align: 'center' });
      currentY = 50;
    };
    
    drawTitle();
    
    // 繪製每個員工
    monthlyPunchData.forEach((empData) => {
      // 每個員工需要的空間：標題(20) + 表頭(20) + 分隔線(5) + 每日數據(daysInMonth * lineHeight) + 間距(10)
      const neededHeight = 20 + 20 + 5 + (daysInMonth * lineHeight) + 10;
      
      // 如果空間不夠，換頁
      if (currentY + neededHeight > pageHeight - 30) {
        drawTitle();
      }
      
      // 員工姓名
      pdf.setTextColor(31, 41, 55);
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.text(empData.name, marginLeft, currentY);
      currentY += 18;
      
      // 表頭
      pdf.setTextColor(55, 65, 81);
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'bold');
      let x = marginLeft;
      pdf.text('日期', x, currentY);
      x += colWidths[0];
      pdf.text('星期', x, currentY);
      x += colWidths[1];
      pdf.text('班別', x, currentY);
      x += colWidths[2];
      pdf.text('打卡時間', x, currentY);
      currentY += lineHeight;
      
      // 分隔線
      pdf.setDrawColor(229, 231, 235);
      pdf.setLineWidth(0.5);
      pdf.line(marginLeft, currentY - 2, pageWidth - marginLeft, currentY - 2);
      
      // 每日數據
      pdf.setFont('helvetica', 'normal');
      for (let day = 1; day <= daysInMonth; day++) {
        // 檢查是否需要換頁
        if (currentY + lineHeight > pageHeight - 20) {
          drawTitle();
          // 重新繪製表頭
          pdf.setTextColor(55, 65, 81);
          pdf.setFontSize(9);
          pdf.setFont('helvetica', 'bold');
          x = marginLeft;
          pdf.text('日期', x, currentY);
          x += colWidths[0];
          pdf.text('星期', x, currentY);
          x += colWidths[1];
          pdf.text('班別', x, currentY);
          x += colWidths[2];
          pdf.text('打卡時間', x, currentY);
          currentY += lineHeight;
          pdf.line(marginLeft, currentY - 2, pageWidth - marginLeft, currentY - 2);
          pdf.setFont('helvetica', 'normal');
        }
        
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const date = new Date(dateStr);
        const dayOfWeek = dayLabels[date.getDay()];
        const shift = getShiftForDate(dateStr, empData.id);
        const punches = empData.byDate[dateStr] || [];
        
        x = marginLeft;
        
        // 日期
        pdf.setTextColor(55, 65, 81);
        pdf.text(`${month}/${day}`, x, currentY);
        x += colWidths[0];
        
        // 星期（週末紅色）
        if (dayOfWeek === '六' || dayOfWeek === '日') {
          pdf.setTextColor(220, 38, 38);
        } else {
          pdf.setTextColor(55, 65, 81);
        }
        pdf.text(dayOfWeek, x, currentY);
        x += colWidths[1];
        
        // 班別
        pdf.setTextColor(55, 65, 81);
        pdf.text(shift, x, currentY);
        x += colWidths[2];
        
        // 打卡時間
        if (punches.length > 0) {
          pdf.setTextColor(5, 150, 105);
          const times = punches.map((p) => p.time).join(' ');
          pdf.text(times, x, currentY);
        } else {
          pdf.setTextColor(156, 163, 175);
          pdf.text('無打卡', x, currentY);
        }
        
        currentY += lineHeight;
      }
      
      currentY += 8; // 員工之間的間距
    });
    
    // 添加頁碼
    const totalPages = pdf.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      pdf.setPage(i);
      pdf.setTextColor(156, 163, 175);
      pdf.setFontSize(8);
      pdf.text(`第 ${i} 頁 / 共 ${totalPages} 頁`, pageWidth / 2, pageHeight - 10, { align: 'center' });
    }
    
    pdf.save(`打卡記錄_${year}_${String(month).padStart(2, '0')}.pdf`);
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
          <div className="flex gap-2">
            <button
              onClick={() => setShowMonthlyDetail(!showMonthlyDetail)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
            >
              <Calendar className="h-4 w-4" />
              {showMonthlyDetail ? '隱藏打卡明細' : '查看打卡明細'}
            </button>
            <button onClick={exportMonthlyPunchPdf} className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg text-sm hover:bg-orange-700">
              <Download className="h-4 w-4" />
              匯出打卡 PDF
            </button>
            <button onClick={exportExcelReport} className="app-btn-primary">
              匯出 Excel 報表
            </button>
          </div>
        )}
      </div>

      {/* 打卡明細面板 */}
      {showMonthlyDetail && canExport && (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="p-4 border-b bg-gray-50">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {year} 年 {month} 月 打卡明細
            </h3>
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {monthlyPunchData.map((empData) => (
              <div key={empData.id} className="border-b last:border-b-0 p-4">
                <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-gray-500" />
                  {empData.name}
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 gap-2">
                  {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const date = new Date(dateStr);
                    const dayOfWeek = date.getDay();
                    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                    const shift = getShiftForDate(dateStr, empData.id);
                    const punches = empData.byDate[dateStr] || [];
                    
                    return (
                      <div
                        key={day}
                        className={`p-2 rounded-lg border text-xs ${
                          isWeekend
                            ? 'bg-red-50 border-red-200'
                            : 'bg-gray-50 border-gray-200'
                        }`}
                      >
                        <div className="flex justify-between items-center mb-1">
                          <span className={`font-medium ${isWeekend ? 'text-red-600' : 'text-gray-700'}`}>
                            {month}/{day}
                          </span>
                          <span className="text-gray-400">{['日', '一', '二', '三', '四', '五', '六'][dayOfWeek]}</span>
                        </div>
                        <div className="text-gray-600 mb-1">
                          班別：<span className="font-medium">{shift}</span>
                        </div>
                        <div className="space-y-0.5">
                          {punches.length > 0 ? (
                            punches.map((p, idx) => (
                              <div key={idx} className={`text-xs ${p.action === 'work_in' ? 'text-green-600' : 'text-blue-600'}`}>
                                {p.action === 'work_in' ? '進' : '出'}：{p.time}
                                {p.lateMinutes > 0 && <span className="text-red-500 ml-1">遲{p.lateMinutes}分</span>}
                              </div>
                            ))
                          ) : (
                            <div className="text-gray-400 text-xs">無打卡</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-4 text-left text-sm font-medium text-gray-700">員工</th>
              <th className="p-4 text-center text-sm font-medium text-gray-700">上班天數</th>
              <th className="p-4 text-center text-sm font-medium text-gray-700">上班時數</th>
              <th className="p-4 text-center text-sm font-medium text-gray-700">加班費</th>
              <th className="p-4 text-center text-sm font-medium text-gray-700">國定假日</th>
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
                <td className="p-4 text-center text-indigo-600 font-medium">{stat.holidayOvertimeHours}小時</td>
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
