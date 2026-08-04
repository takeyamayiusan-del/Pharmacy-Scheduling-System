'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp, type LeaveType, type ShiftType } from '@/lib/context/AppContext';
import {
  calculateLeaveWorkHours,
  LEAVE_TYPE_OPTIONS,
  periodToTimes,
  type LeavePeriod,
} from '@/lib/attendance/leaveHours';
import { currentMonthMinDate } from '@/lib/schedule/monthAccess';
import {
  buildLeaveFormPrintData,
  printLeaveApplicationForm,
} from '@/lib/applications/printLeaveForm';
import {
  MonthFilterBar,
  doesRangeOverlapYearMonth,
  getCurrentYearMonth,
} from '@/components/MonthFilterBar';

const PERIOD_OPTIONS: { label: string; value: LeavePeriod }[] = [
  { label: '全天', value: 'full_day' },
  { label: '上午', value: 'morning' },
  { label: '下午', value: 'afternoon' },
  { label: '自訂時間', value: 'custom' },
];

const SHIFT_OPTIONS: { label: string; value: 'schedule' | ShiftType }[] = [
  { label: '依當日班表', value: 'schedule' },
  { label: 'A 班（全天+晚）', value: 'A' },
  { label: 'B 班（白班）', value: 'B' },
  { label: 'C 班（上午）', value: 'C' },
  { label: 'D 班（下午）', value: 'D' },
  { label: 'E 班', value: 'E' },
];

export default function LeaveApplicationPage() {
  const router = useRouter();
  const {
    currentUser,
    employees,
    leaveRequests,
    addLeaveRequest,
    updateLeaveRequestStatus,
    deleteLeaveRequest,
    shiftTimeConfig,
    getShiftForDate,
    getCompLeaveBalance,
    getAnnualLeaveBalance,
  } = useApp();

  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    startDate: '',
    endDate: '',
    startTime: '08:30',
    endTime: '18:00',
    period: 'full_day' as LeavePeriod,
    shiftMode: 'schedule' as 'schedule' | ShiftType,
    type: '事假' as LeaveType,
    reason: '',
  });
  const [rejectModal, setRejectModal] = useState<{ id: string; reason: string } | null>(null);
  const [submitError, setSubmitError] = useState('');
  const initialPeriod = getCurrentYearMonth();
  const [filterYear, setFilterYear] = useState(initialPeriod.year);
  const [filterMonth, setFilterMonth] = useState(initialPeriod.month);

  const isManager = currentUser?.role === 'owner' || currentUser?.role === 'manager';

  const previewShiftForCalc = useMemo(() => {
    if (formData.shiftMode !== 'schedule') return formData.shiftMode;
    if (!currentUser || !formData.startDate) return 'B' as ShiftType;
    return getShiftForDate(formData.startDate, currentUser.id);
  }, [formData.shiftMode, formData.startDate, currentUser, getShiftForDate]);

  const estimatedHours = useMemo(() => {
    if (!currentUser || !formData.startDate || !formData.endDate) return 0;
    let startTime = formData.startTime;
    let endTime = formData.endTime;
    if (formData.period !== 'custom') {
      const times = periodToTimes(formData.period, previewShiftForCalc, shiftTimeConfig);
      startTime = times.startTime;
      endTime = times.endTime;
    }
    return calculateLeaveWorkHours({
      startDate: formData.startDate,
      endDate: formData.endDate,
      startTime,
      endTime,
      period: formData.period,
      shiftMode: formData.shiftMode,
      employeeId: currentUser.id,
      getShiftForDate,
      shiftTimeConfig,
    });
  }, [currentUser, formData, previewShiftForCalc, getShiftForDate, shiftTimeConfig]);

  const compBalance = currentUser ? getCompLeaveBalance(currentUser.id) : 0;
  const annualBalance = currentUser ? getAnnualLeaveBalance(currentUser.id, new Date().getFullYear()) : 0;

  const applyPeriodPreset = (period: LeavePeriod) => {
    const times = periodToTimes(period, previewShiftForCalc, shiftTimeConfig);
    setFormData((prev) => ({
      ...prev,
      period,
      startTime: times.startTime,
      endTime: times.endTime,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    if (!currentUser) return;
    if (formData.endDate < formData.startDate) {
      setSubmitError('結束日期不可早於開始日期');
      return;
    }
    if (estimatedHours <= 0) {
      setSubmitError('請假時數為 0，請確認日期、班別與時段（休假或未與上班時段重疊）');
      return;
    }
    if (formData.type === '補休假' && compBalance < estimatedHours) {
      setSubmitError(`補休餘額不足（可用 ${compBalance} 小時，本次需要 ${estimatedHours} 小時）`);
      return;
    }
    if (formData.type === '特休') {
      const year = new Date(formData.startDate).getFullYear();
      const balance = getAnnualLeaveBalance(currentUser.id, year);
      if (balance < estimatedHours / 8) {
        setSubmitError(`特休餘額不足（剩餘 ${balance.toFixed(1)} 天，本次需要 ${(estimatedHours / 8).toFixed(1)} 天）`);
        return;
      }
    }

    let startTime = formData.startTime;
    let endTime = formData.endTime;
    if (formData.period !== 'custom') {
      const times = periodToTimes(formData.period, previewShiftForCalc, shiftTimeConfig);
      startTime = times.startTime;
      endTime = times.endTime;
    }

    try {
      await addLeaveRequest({
        employeeId: currentUser.id,
        employeeName: currentUser.name,
        startDate: formData.startDate,
        endDate: formData.endDate,
        startTime,
        endTime,
        period: formData.period,
        shiftMode: formData.shiftMode,
        leaveHours: estimatedHours,
        type: formData.type,
        reason: formData.reason,
        status: 'pending',
      });

      setShowForm(false);
      setFormData({
        startDate: '',
        endDate: '',
        startTime: '08:30',
        endTime: '18:00',
        period: 'full_day',
        shiftMode: 'schedule',
        type: '事假',
        reason: '',
      });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : '申請失敗');
    }
  };

  const handleReject = async () => {
    if (!rejectModal) return;
    try {
      await updateLeaveRequestStatus(rejectModal.id, 'rejected', rejectModal.reason);
      setRejectModal(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : '操作失敗');
    }
  };

  const handleApprove = async (id: string) => {
    const req = leaveRequests.find((r) => r.id === id);
    if (!req) return;
    try {
      await updateLeaveRequestStatus(id, 'approved');
      const reviewedAt = new Date().toISOString();
      if (window.confirm('核准成功。是否列印請假簽名表？')) {
        printLeaveApplicationForm(
          buildLeaveFormPrintData(req, {
            reviewedByName: currentUser?.name,
            reviewedAt,
            leaveHours: calcDisplayHours(req),
          })
        );
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '核准失敗');
    }
  };

  const calcDisplayHours = (req: (typeof leaveRequests)[number]) =>
    req.leaveHours > 0
      ? req.leaveHours
      : calculateLeaveWorkHours({
          startDate: req.startDate,
          endDate: req.endDate,
          startTime: req.startTime,
          endTime: req.endTime,
          period: req.period,
          shiftMode: req.shiftMode,
          employeeId: req.employeeId,
          getShiftForDate,
          shiftTimeConfig,
        });

  const handlePrintLeaveForm = (req: (typeof leaveRequests)[number]) => {
    try {
      printLeaveApplicationForm(
        buildLeaveFormPrintData(req, { leaveHours: calcDisplayHours(req) })
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : '列印失敗');
    }
  };

  const statusLabels: Record<string, { label: string; color: string }> = {
    pending: { label: '待審核', color: 'bg-yellow-100 text-yellow-800' },
    approved: { label: '已核准', color: 'bg-green-100 text-green-800' },
    rejected: { label: '已駁回', color: 'bg-red-100 text-red-800' },
  };

  const periodLabel: Record<LeavePeriod, string> = {
    full_day: '全天',
    morning: '上午',
    afternoon: '下午',
    custom: '自訂',
  };

  const getEmpName = (id: string) => employees.find((e) => e.id === id)?.name ?? id;

  const visibleRequests = useMemo(() => {
    const scoped = isManager
      ? leaveRequests
      : leaveRequests.filter((r) => r.employeeId === currentUser?.id);
    return scoped.filter((r) =>
      doesRangeOverlapYearMonth(r.startDate, r.endDate, filterYear, filterMonth)
    );
  }, [isManager, leaveRequests, currentUser?.id, filterYear, filterMonth]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-2xl font-bold text-gray-900">請假申請</h2>
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/applications/leave/annual-summary')}
            className="px-4 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
          >
            📅 年度特休總表
          </button>
          {currentUser?.role !== 'owner' && (
            <button
              onClick={() => setShowForm(!showForm)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              + 新增申請
            </button>
          )}
        </div>
      </div>

      {currentUser && currentUser.role !== 'owner' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-900">
            <div className="font-semibold mb-2">年度特休時數</div>
            <div className="text-3xl font-bold text-blue-600">{annualBalance.toFixed(1)}</div>
            <div className="text-xs text-blue-700 mt-1">天數</div>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm text-emerald-900">
            <div className="font-semibold mb-2">可用補休時數</div>
            <div className="text-3xl font-bold text-emerald-600">{compBalance}</div>
            <div className="text-xs text-emerald-700 mt-1">小時（加班選擇「補休」累積，半年內有效）</div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">開始日期</label>
                <input
                  type="date"
                  value={formData.startDate}
                  min={currentMonthMinDate()}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      startDate: e.target.value,
                      endDate: formData.endDate || e.target.value,
                    })
                  }
                  className="w-full px-4 py-2 border rounded-lg"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">結束日期</label>
                <input
                  type="date"
                  value={formData.endDate}
                  min={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">班別計算基準</label>
              <select
                value={formData.shiftMode}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    shiftMode: e.target.value as 'schedule' | ShiftType,
                  })
                }
                className="w-full px-4 py-2 border rounded-lg"
              >
                {SHIFT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                「依當日班表」會逐日讀取排班；固定班別則整段請假皆用該班時段計算。
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">請假時段</label>
              <div className="flex flex-wrap gap-3 mb-2">
                {PERIOD_OPTIONS.map((opt) => (
                  <label key={opt.value} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="period"
                      checked={formData.period === opt.value}
                      onChange={() => applyPeriodPreset(opt.value)}
                    />
                    <span className="text-sm">{opt.label}</span>
                  </label>
                ))}
              </div>
              {formData.period === 'custom' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">開始時間（首日）</label>
                    <input
                      type="time"
                      value={formData.startTime}
                      onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">結束時間（末日）</label>
                    <input
                      type="time"
                      value={formData.endTime}
                      onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>
                </div>
              )}
              <p className="text-sm text-blue-700 font-medium mt-2">
                預估請假時數（僅計上班時段，休息不計）：{estimatedHours} 小時
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">假別</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as LeaveType })}
                className="w-full px-4 py-2 border rounded-lg"
              >
                {LEAVE_TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">事由</label>
              <textarea
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg"
                rows={3}
                required
              />
            </div>

            {submitError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {submitError}
              </p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                取消
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                送出申請
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="p-4 border-b bg-gray-50 flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-medium text-gray-900">請假申請記錄</h3>
          <MonthFilterBar
            year={filterYear}
            month={filterMonth}
            onYearChange={setFilterYear}
            onMonthChange={setFilterMonth}
            count={visibleRequests.length}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-4 text-left font-medium text-gray-700">員工</th>
                <th className="p-4 text-left font-medium text-gray-700">日期區間</th>
                <th className="p-4 text-left font-medium text-gray-700">時段</th>
                <th className="p-4 text-left font-medium text-gray-700">時數</th>
                <th className="p-4 text-left font-medium text-gray-700">假別</th>
                <th className="p-4 text-left font-medium text-gray-700">事由</th>
                <th className="p-4 text-left font-medium text-gray-700">狀態</th>
                <th className="p-4 text-left font-medium text-gray-700">審核說明</th>
                <th className="p-4 text-left font-medium text-gray-700">簽名表</th>
                {isManager && <th className="p-4 text-left font-medium text-gray-700">操作</th>}
              </tr>
            </thead>
            <tbody className="divide-y">
              {visibleRequests.length === 0 && (
                <tr>
                  <td colSpan={isManager ? 10 : 9} className="p-8 text-center text-gray-500">
                    本月沒有請假申請
                  </td>
                </tr>
              )}
              {visibleRequests.map((req) => {
                const status = statusLabels[req.status];
                const empName = req.employeeName || getEmpName(req.employeeId);
                const displayHours = calcDisplayHours(req);
                return (
                  <tr key={req.id} className="hover:bg-gray-50">
                    <td className="p-4 font-medium text-gray-900">{empName}</td>
                    <td className="p-4 text-gray-600">
                      {req.startDate}
                      {req.endDate !== req.startDate ? ` ～ ${req.endDate}` : ''}
                    </td>
                    <td className="p-4 text-gray-600">
                      {periodLabel[req.period] ?? '全天'}
                      <span className="block text-xs text-gray-400">
                        {req.startTime}–{req.endTime}
                      </span>
                    </td>
                    <td className="p-4 text-gray-600">{displayHours} 小時</td>
                    <td className="p-4 text-gray-600">{req.type}</td>
                    <td className="p-4 text-gray-600 max-w-xs truncate">{req.reason}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${status.color}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="p-4 text-sm text-gray-600 max-w-xs">
                      {req.status === 'rejected' && req.rejectReason ? (
                        <span className="text-red-700">{req.rejectReason}</span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="p-4">
                      {req.status === 'approved' ? (
                        <button
                          type="button"
                          onClick={() => handlePrintLeaveForm(req)}
                          className="px-2 py-1 border border-blue-600 text-blue-600 rounded text-xs hover:bg-blue-50"
                        >
                          列印簽名表
                        </button>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
                    {isManager && (
                      <td className="p-4">
                        <div className="flex gap-1 flex-wrap">
                          {req.status === 'pending' && (
                            <>
                              <button
                                onClick={() => handleApprove(req.id)}
                                className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700"
                              >
                                核准
                              </button>
                              <button
                                onClick={() => setRejectModal({ id: req.id, reason: '' })}
                                className="px-2 py-1 bg-orange-500 text-white rounded text-xs hover:bg-orange-600"
                              >
                                駁回
                              </button>
                            </>
                          )}
                          {req.status !== 'pending' && (
                            <button
                              onClick={() => updateLeaveRequestStatus(req.id, 'pending')}
                              className="px-2 py-1 border rounded text-xs hover:bg-gray-50"
                            >
                              取消審核
                            </button>
                          )}
                          <button
                            onClick={async () => {
                              if (!confirm('確定刪除？')) return;
                              try {
                                await deleteLeaveRequest(req.id);
                              } catch (error) {
                                console.error(error);
                                alert('刪除失敗，請稍後再試。');
                              }
                            }}
                            className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs hover:bg-red-200"
                          >
                            刪除
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {rejectModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="font-semibold text-gray-900 mb-3">填寫駁回原因</h3>
            <textarea
              value={rejectModal.reason}
              onChange={(e) => setRejectModal({ ...rejectModal, reason: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm mb-3"
              rows={3}
              placeholder="請輸入駁回原因（選填）"
            />
            <div className="flex gap-2">
              <button
                onClick={handleReject}
                className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700"
              >
                確認駁回
              </button>
              <button
                onClick={() => setRejectModal(null)}
                className="flex-1 py-2 border rounded-lg text-sm"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
