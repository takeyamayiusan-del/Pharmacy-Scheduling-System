'use client';

import { useMemo, useState } from 'react';
import { useApp } from '@/lib/context/AppContext';
import { formatCompLeaveHours } from '@/lib/attendance/compLeaveDisplay';
import {
  buildCompLeaveMonthSummary,
  buildLeaveBreakdownInMonth,
  formatLeaveBreakdownText,
} from '@/lib/attendance/monthlyStatsView';
import { computeMonthlyAttendanceHours, getDefaultPayrollPeriod } from '@/lib/payroll/monthlyHours';
import { buildEffectiveTardinessRecords } from '@/lib/tardiness';
import { Download, FileText, Calendar, Clock } from 'lucide-react';
import { exportMonthlyPunchPdf as exportPunchPdfDocument } from '@/lib/attendance/exportPunchPdf';

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
    compLeaveLedger,
    getCompLeaveBalance,
  } = useApp();

  const [currentDate, setCurrentDate] = useState(() => {
    const { year, month } = getDefaultPayrollPeriod();
    return new Date(year, month - 1, 1);
  });
  const [showMonthlyDetail, setShowMonthlyDetail] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;
  const daysInMonth = new Date(year, month, 0).getDate();

  const canExport = currentUser?.role === 'owner' || currentUser?.role === 'manager';
  const targetEmployees = employees.filter((emp) => emp.role !== 'owner');
  const displayEmployees = canExport
    ? targetEmployees
    : targetEmployees.filter((emp) => emp.id === currentUser?.id);

  const isDateInMonth = (dateValue: string, y: number, m: number) => {
    const match = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return false;
    return Number(match[1]) === y && Number(match[2]) === m;
  };

  const stats = useMemo(() => {
    const effectiveTardinessRecords = buildEffectiveTardinessRecords(
      tardinessRecords,
      punchRecords,
      overtimeRequests,
      leaveRequests
    );

    return displayEmployees.map((emp) => {
      const hours = computeMonthlyAttendanceHours({
        employeeId: emp.id,
        year,
        month,
        getShiftForDate,
        getHolidayInfo,
        shiftTimeConfig,
        leaveRequests,
        overtimeRequests,
      });

      const leaveBreakdown = buildLeaveBreakdownInMonth({
        employeeId: emp.id,
        year,
        month,
        leaveRequests,
        getShiftForDate,
        shiftTimeConfig,
      });

      const comp = buildCompLeaveMonthSummary({
        employeeId: emp.id,
        year,
        month,
        ledger: compLeaveLedger,
        currentBalance: getCompLeaveBalance(emp.id),
        overtimeRequests,
        leaveRequests,
      });

      const tardy = effectiveTardinessRecords
        .filter((item) => item.employeeId === emp.id)
        .filter((item) => isDateInMonth(item.date, year, month));

      return {
        id: emp.id,
        name: emp.name,
        workDays: hours.workDays,
        workHours: hours.workHours,
        overtimeHours: hours.overtimePayHours,
        holidayOvertimeHours: hours.holidayOvertimeHours,
        compensatoryEarnedFromOt: hours.compensatoryHours,
        leaveHours: leaveBreakdown.totalHours,
        leaveByType: leaveBreakdown.byType,
        leaveItems: leaveBreakdown.items,
        leaveText: formatLeaveBreakdownText(leaveBreakdown.byType),
        compEarned: comp.earnedHours,
        compUsed: comp.usedHours,
        compNet: comp.netHours,
        compBalance: comp.balance,
        compHint: comp.hint,
        compOvertimeCredit: comp.overtimeCreditHours,
        compTyphoonCredit: comp.typhoonCreditHours,
        compAdjustmentCredit: comp.adjustmentCreditHours,
        compLeaveDebit: comp.leaveDebitHours,
        compTyphoonDebit: comp.typhoonDebitHours,
        compAdjustmentDebit: comp.adjustmentDebitHours,
        compLeaveRefund: comp.leaveRefundHours,
        compOvertimeReversal: comp.overtimeReversalHours,
        compLines: comp.lines,
        tardyCount: tardy.length,
        tardyMinutes: tardy.reduce((sum, item) => sum + item.minutes, 0),
      };
    });
  }, [
    displayEmployees,
    year,
    month,
    getShiftForDate,
    getHolidayInfo,
    shiftTimeConfig,
    leaveRequests,
    overtimeRequests,
    tardinessRecords,
    punchRecords,
    compLeaveLedger,
    getCompLeaveBalance,
  ]);

  const monthlyPunchData = useMemo(() => {
    return displayEmployees.map((emp) => {
      const employeePunches = punchRecords
        .filter((p) => p.employeeId === emp.id)
        .filter((p) => isDateInMonth(p.date, year, month))
        .sort((a, b) => {
          if (a.date !== b.date) return a.date.localeCompare(b.date);
          return a.time.localeCompare(b.time);
        });

      const byDate: Record<string, typeof employeePunches> = {};
      employeePunches.forEach((p) => {
        if (!byDate[p.date]) byDate[p.date] = [];
        byDate[p.date].push(p);
      });

      return { id: emp.id, name: emp.name, byDate };
    });
  }, [displayEmployees, punchRecords, year, month]);

  const prevMonth = () => setCurrentDate(new Date(year, month - 2, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month, 1));

  const exportExcelReport = () => {
    const header = [
      '員工',
      '上班天數',
      '上班時數',
      '加班費時數',
      '國定假日加班',
      '本月加班轉補休',
      '本月補休賺得',
      '本月補休使用',
      '補休餘額',
      '請假總時數',
      '請假明細',
      '遲到次數',
      '遲到分鐘數',
      '補休提醒',
    ];
    const rows = stats.map((item) => [
      item.name,
      item.workDays,
      item.workHours,
      item.overtimeHours,
      item.holidayOvertimeHours,
      item.compensatoryEarnedFromOt,
      item.compEarned,
      item.compUsed,
      item.compBalance,
      item.leaveHours,
      item.leaveText,
      item.tardyCount,
      item.tardyMinutes,
      item.compHint,
    ]);

    const csv = [header, ...rows]
      .map((row) =>
        row
          .map((cell) => {
            const text = String(cell ?? '');
            return text.includes(',') || text.includes('"') || text.includes('\n')
              ? `"${text.replace(/"/g, '""')}"`
              : text;
          })
          .join(',')
      )
      .join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `工時與補休報表-${year}-${String(month).padStart(2, '0')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportMonthlyPunchPdf = async () => {
    try {
      await exportPunchPdfDocument({
        year,
        month,
        daysInMonth,
        employees: monthlyPunchData,
        getShiftForDate,
      });
    } catch (error) {
      console.error('[attendance] export punch pdf failed', error);
      alert('匯出打卡 PDF 失敗，請稍後再試');
    }
  };

  const negativeCount = stats.filter((s) => s.compBalance < 0).length;
  const positiveCount = stats.filter((s) => s.compBalance > 0).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="p-2 border rounded hover:bg-gray-50" type="button">
            ◀
          </button>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              {year}年{month}月 工時統計
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              預設顯示上個月（方便結薪）；上班時數與薪資試算同一套計算
            </p>
          </div>
          <button onClick={nextMonth} className="p-2 border rounded hover:bg-gray-50" type="button">
            ▶
          </button>
        </div>
        {canExport && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowMonthlyDetail(!showMonthlyDetail)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
            >
              <Calendar className="h-4 w-4" />
              {showMonthlyDetail ? '隱藏打卡明細' : '查看打卡明細'}
            </button>
            <button
              type="button"
              onClick={() => void exportMonthlyPunchPdf()}
              className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg text-sm hover:bg-orange-700"
            >
              <Download className="h-4 w-4" />
              匯出打卡 PDF
            </button>
            <button type="button" onClick={exportExcelReport} className="app-btn-primary">
              匯出 Excel 報表
            </button>
          </div>
        )}
      </div>

      {canExport && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-xl border bg-white p-4">
            <p className="text-xs text-gray-500">統計人數</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{stats.length} 人</p>
          </div>
          <div className="rounded-xl border bg-amber-50 border-amber-200 p-4">
            <p className="text-xs text-amber-800">補休借支（負餘額）</p>
            <p className="text-2xl font-bold text-amber-800 mt-1">{negativeCount} 人</p>
            <p className="text-xs text-amber-700 mt-1">需安排下月加班轉補休補回</p>
          </div>
          <div className="rounded-xl border bg-emerald-50 border-emerald-200 p-4">
            <p className="text-xs text-emerald-800">補休尚有餘額</p>
            <p className="text-2xl font-bold text-emerald-800 mt-1">{positiveCount} 人</p>
            <p className="text-xs text-emerald-700 mt-1">可提醒安排補休假</p>
          </div>
        </div>
      )}

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
                          isWeekend ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'
                        }`}
                      >
                        <div className="flex justify-between items-center mb-1">
                          <span className={`font-medium ${isWeekend ? 'text-red-600' : 'text-gray-700'}`}>
                            {month}/{day}
                          </span>
                          <span className="text-gray-400">
                            {['日', '一', '二', '三', '四', '五', '六'][dayOfWeek]}
                          </span>
                        </div>
                        <div className="text-gray-600 mb-1">
                          班別：<span className="font-medium">{shift}</span>
                        </div>
                        <div className="space-y-0.5">
                          {punches.length > 0 ? (
                            punches.map((p, idx) => (
                              <div
                                key={idx}
                                className={`text-xs ${
                                  p.action === 'work_in' ? 'text-green-600' : 'text-blue-600'
                                }`}
                              >
                                {p.action === 'work_in' ? '進' : '出'}：{p.time}
                                {p.action === 'work_in' && p.lateMinutes > 0 && (
                                  <span className="text-red-500 ml-1">遲{p.lateMinutes}分</span>
                                )}
                                {p.action === 'work_out' && p.reason?.includes('加班') && (
                                  <span className="text-blue-500 ml-1">逾時</span>
                                )}
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

      <div className="space-y-3">
        {stats.map((stat) => {
          const open = expandedId === stat.id;
          return (
            <div key={stat.id} className="bg-white rounded-xl shadow-sm border overflow-hidden">
              <button
                type="button"
                onClick={() => setExpandedId(open ? null : stat.id)}
                className="w-full text-left p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-gray-900">{stat.name}</p>
                    <p className="text-sm text-gray-600 mt-1">
                      上班 {stat.workDays} 天／{formatCompLeaveHours(stat.workHours)} 小時
                      <span className="mx-2 text-gray-300">|</span>
                      加班費 {formatCompLeaveHours(stat.overtimeHours)} h
                      <span className="mx-2 text-gray-300">|</span>
                      國定假 {formatCompLeaveHours(stat.holidayOvertimeHours)} h
                    </p>
                    <p className="text-sm text-gray-700 mt-1">
                      <span className="font-medium text-red-700">請假</span>：{stat.leaveText}
                      {stat.leaveHours > 0
                        ? `（共 ${formatCompLeaveHours(stat.leaveHours)} h）`
                        : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p
                      className={`text-lg font-bold ${
                        stat.compBalance < 0
                          ? 'text-amber-700'
                          : stat.compBalance > 0
                            ? 'text-emerald-700'
                            : 'text-gray-700'
                      }`}
                    >
                      補休餘額 {formatCompLeaveHours(stat.compBalance)} h
                      {stat.compBalance < 0 ? '（借支）' : ''}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      本月賺 +{formatCompLeaveHours(stat.compEarned)}／請 −
                      {formatCompLeaveHours(stat.compUsed)}
                    </p>
                    <p
                      className={`text-xs mt-1 ${
                        stat.compBalance < 0 ? 'text-amber-700' : 'text-emerald-700'
                      }`}
                    >
                      {stat.compHint}
                    </p>
                  </div>
                </div>
              </button>

              {open && (
                <div className="border-t bg-gray-50 p-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="font-medium text-gray-900 mb-2">請假明細（本月）</p>
                    {stat.leaveItems.length === 0 ? (
                      <p className="text-gray-500">本月無核准請假</p>
                    ) : (
                      <ul className="space-y-1">
                        {stat.leaveItems.map((item, idx) => (
                          <li key={`${item.type}-${item.startDate}-${idx}`} className="text-gray-700">
                            <span className="font-medium text-red-700">{item.type}</span>
                            {' · '}
                            {item.startDate}
                            {item.endDate !== item.startDate ? `～${item.endDate}` : ''}
                            {' · '}
                            {formatCompLeaveHours(item.hours)} 小時
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 mb-2">補休進出（本月）</p>
                    <ul className="space-y-1 text-gray-700">
                      <li>
                        加班轉補休（申請核准）：
                        {formatCompLeaveHours(stat.compensatoryEarnedFromOt)} 小時
                        {Math.abs(stat.compensatoryEarnedFromOt - stat.compOvertimeCredit) > 0.01 && (
                          <span className="text-xs text-amber-700 ml-1">
                            （帳本 {formatCompLeaveHours(stat.compOvertimeCredit)}h）
                          </span>
                        )}
                      </li>
                      {stat.compTyphoonCredit > 0 && (
                        <li>颱風／彈性出勤補休：+{formatCompLeaveHours(stat.compTyphoonCredit)} 小時</li>
                      )}
                      {stat.compAdjustmentCredit > 0 && (
                        <li>手動核發：+{formatCompLeaveHours(stat.compAdjustmentCredit)} 小時</li>
                      )}
                      <li className="font-medium text-emerald-800">
                        本月賺得合計：+{formatCompLeaveHours(stat.compEarned)} 小時
                        <span className="font-normal text-xs text-gray-500 ml-1">
                          （加班＋颱風＋手動，不含退回）
                        </span>
                      </li>
                      <li>
                        補休假使用：−{formatCompLeaveHours(stat.compLeaveDebit)} 小時
                      </li>
                      {stat.compTyphoonDebit > 0 && (
                        <li>颱風扣補休：−{formatCompLeaveHours(stat.compTyphoonDebit)} 小時</li>
                      )}
                      {stat.compAdjustmentDebit > 0 && (
                        <li>手動扣回：−{formatCompLeaveHours(stat.compAdjustmentDebit)} 小時</li>
                      )}
                      <li className="font-medium text-red-800">
                        本月使用合計：−{formatCompLeaveHours(stat.compUsed)} 小時
                      </li>
                      {stat.compLeaveRefund > 0 && (
                        <li className="text-gray-600">
                          取消請假退回：+{formatCompLeaveHours(stat.compLeaveRefund)} 小時
                        </li>
                      )}
                      {stat.compOvertimeReversal > 0 && (
                        <li className="text-gray-600">
                          取消加班沖銷：−{formatCompLeaveHours(stat.compOvertimeReversal)} 小時
                        </li>
                      )}
                      <li>
                        目前餘額：
                        <span
                          className={
                            stat.compBalance < 0
                              ? 'text-amber-700 font-semibold'
                              : 'text-emerald-700 font-semibold'
                          }
                        >
                          {formatCompLeaveHours(stat.compBalance)} 小時
                        </span>
                      </li>
                      <li className="text-xs text-gray-500 pt-1">{stat.compHint}</li>
                    </ul>
                    {stat.compLines.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs font-medium text-gray-600 mb-1">帳本明細</p>
                        <ul className="space-y-0.5 text-xs text-gray-600 max-h-40 overflow-y-auto">
                          {stat.compLines.map((line, idx) => (
                            <li key={`${line.eventDate}-${line.label}-${idx}`}>
                              {line.eventDate} · {line.label}{' '}
                              <span className={line.hours >= 0 ? 'text-emerald-700' : 'text-red-700'}>
                                {line.hours >= 0 ? '+' : ''}
                                {formatCompLeaveHours(line.hours)}h
                              </span>
                              {line.note ? (
                                <span className="text-gray-400">（{line.note}）</span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <p className="mt-3 text-gray-600">
                      遲到：{stat.tardyCount} 次／{stat.tardyMinutes} 分鐘
                    </p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
