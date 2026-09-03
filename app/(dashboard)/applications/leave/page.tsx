'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp, type LeaveType } from '@/lib/context/AppContext';
import { canManageSite } from '@/lib/auth/roles';
import { approvalPendingLabel, canActOnApprovalStep, currentApprovalRole, effectiveApprovalChain } from '@/lib/approvals/chain';
import {
  calculateLeaveWorkHours,
  LEAVE_TYPE_OPTIONS,
  periodToTimes,
  type LeavePeriod,
} from '@/lib/attendance/leaveHours';
import {
  effectiveLeaveRule,
  formatLeaveLimit,
  leaveLimitWarnings,
  leavePayKindLabel,
} from '@/lib/attendance/leaveEntitlements';
import { getOriginalShiftForLeaveDay } from '@/lib/schedule/leaveSchedule';
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
import { HelpTip } from '@/components/ui/HelpTip';
import {
  getScheduleShiftOptions,
  isOffShiftCode,
  resolveShiftDisplay,
} from '@/lib/shift-catalog/resolve';

const PERIOD_OPTIONS: { label: string; value: LeavePeriod }[] = [
  { label: '全天', value: 'full_day' },
  { label: '上午', value: 'morning' },
  { label: '下午', value: 'afternoon' },
  { label: '自訂時間', value: 'custom' },
];

export default function LeaveApplicationPage() {
  const router = useRouter();
  const {
    currentUser,
    employees,
    leaveRequests,
    addLeaveRequest,
    openLeaveAttachment,
    updateLeaveRequestStatus,
    deleteLeaveRequest,
    shiftTimeConfig,
    getShiftForDate,
    getCompLeaveBalance,
    loadCompLeaveLedger,
    getAnnualLeaveBalance,
    storeConfig,
    shiftDisplayConfig,
    activeSiteId,
  } = useApp();

  const shiftOptions = useMemo(() => {
    const opts: { label: string; value: 'schedule' | string }[] = [
      { label: '依當日班表', value: 'schedule' },
    ];
    for (const code of getScheduleShiftOptions(storeConfig)) {
      if (isOffShiftCode(code, storeConfig)) continue;
      const display = resolveShiftDisplay(code, storeConfig, shiftDisplayConfig);
      opts.push({
        label: `${display.displayText || code}（${display.label}）`,
        value: code,
      });
    }
    return opts;
  }, [storeConfig, shiftDisplayConfig]);

  // 店長／副店／老闆進入請假頁時，依序補扣過去核准但漏扣的補休假
  useEffect(() => {
    if (!canManageSite(currentUser?.role)) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/attendance/backfill-comp-leave-debits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ site_id: activeSiteId }),
        });
        const data = (await res.json().catch(() => null)) as {
          inserted?: number;
          error?: string;
        } | null;
        if (!res.ok) {
          console.warn("[leave] backfill comp leave debits failed", data?.error);
          return;
        }
        if (!cancelled && (data?.inserted ?? 0) > 0) {
          await loadCompLeaveLedger();
        }
      } catch (err) {
        console.warn("[leave] backfill comp leave debits error", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUser?.role, activeSiteId, loadCompLeaveLedger]);

  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    startDate: '',
    endDate: '',
    startTime: '08:30',
    endTime: '18:00',
    period: 'full_day' as LeavePeriod,
    shiftMode: 'schedule' as 'schedule' | string,
    type: '事假' as LeaveType,
    reason: '',
  });
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [targetEmployeeId, setTargetEmployeeId] = useState('');
  const [rejectModal, setRejectModal] = useState<{ id: string; reason: string } | null>(null);
  const [submitError, setSubmitError] = useState('');
  const initialPeriod = getCurrentYearMonth();
  const [filterYear, setFilterYear] = useState(initialPeriod.year);
  const [filterMonth, setFilterMonth] = useState(initialPeriod.month);
  const [filterEmployeeId, setFilterEmployeeId] = useState('');
  const storageScope = `${currentUser?.id ?? "guest"}:${activeSiteId}`;

  const isManager =
    canManageSite(currentUser?.role) || currentUser?.capabilities?.approve === true;
  const staffEmployees = useMemo(
    () => employees.filter((e) => e.role !== 'owner'),
    [employees]
  );
  const formEmployeeId = isManager
    ? targetEmployeeId || currentUser?.id || ''
    : currentUser?.id || '';
  const formEmployee = employees.find((e) => e.id === formEmployeeId) ?? currentUser;
  // 店長／老闆可補登過去月份；員工僅能申請當月起
  const dateMin = isManager ? undefined : currentMonthMinDate();

  const previewShiftForCalc = useMemo(() => {
    if (formData.shiftMode !== 'schedule') return formData.shiftMode;
    if (!formEmployeeId || !formData.startDate) return storeConfig.defaultWeekdayShift || 'B';
    return getShiftForDate(formData.startDate, formEmployeeId);
  }, [formData.shiftMode, formData.startDate, formEmployeeId, getShiftForDate, storeConfig.defaultWeekdayShift]);

  const estimatedHours = useMemo(() => {
    if (!formEmployeeId || !formData.startDate || !formData.endDate) return 0;
    let startTime = formData.startTime;
    let endTime = formData.endTime;
    if (formData.period !== 'custom') {
      const times = periodToTimes(formData.period, previewShiftForCalc, shiftTimeConfig, storeConfig);
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
      employeeId: formEmployeeId,
      getShiftForDate,
      shiftTimeConfig,
      storeConfig,
    });
  }, [formEmployeeId, formData, previewShiftForCalc, getShiftForDate, shiftTimeConfig, storeConfig]);

  const compBalance = formEmployeeId ? getCompLeaveBalance(formEmployeeId) : 0;
  const annualBalance = formEmployeeId
    ? getAnnualLeaveBalance(formEmployeeId, new Date().getFullYear())
    : 0;

  const applyPeriodPreset = (period: LeavePeriod) => {
    const times = periodToTimes(period, previewShiftForCalc, shiftTimeConfig, storeConfig);
    setFormData((prev) => ({
      ...prev,
      period,
      startTime: times.startTime,
      endTime: times.endTime,
    }));
  };

  const selectedLeaveRule = effectiveLeaveRule(
    formData.type,
    storeConfig.policies.leaveRules
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    if (!currentUser || !formEmployee) return;
    if (isManager && !formEmployeeId) {
      setSubmitError('請選擇請假員工');
      return;
    }
    if (formData.endDate < formData.startDate) {
      setSubmitError('結束日期不可早於開始日期');
      return;
    }
    if (estimatedHours <= 0) {
      setSubmitError('請假時數為 0，請確認日期、班別與時段（休假或未與上班時段重疊）');
      return;
    }
    if (formData.type === '補休假' && compBalance < estimatedHours) {
      const after = Math.round((compBalance - estimatedHours) * 100) / 100;
      const ok = window.confirm(
        `補休餘額不足（目前 ${compBalance} 小時，本次 ${estimatedHours} 小時）。\n` +
          `核准後餘額將為 ${after} 小時（可先請後補，之後加班選「補休」會加回）。\n\n確定送出？`
      );
      if (!ok) return;
    }
    if (formData.type === '特休') {
      const year = new Date(formData.startDate).getFullYear();
      const balance = getAnnualLeaveBalance(formEmployeeId, year);
      if (balance < estimatedHours / 8) {
        const ok = window.confirm(
          `特休餘額不足（剩餘 ${balance.toFixed(1)} 天，本次需要 ${(estimatedHours / 8).toFixed(1)} 天）。\n` +
            `僅警示、不硬擋。確定仍要送出？`
        );
        if (!ok) return;
      }
    }

    const capWarnings = leaveLimitWarnings({
      type: formData.type,
      employeeId: formEmployeeId,
      startDate: formData.startDate,
      addHours: estimatedHours,
      requests: leaveRequests,
      overrides: storeConfig.policies.leaveRules,
      hoursPerDay: storeConfig.policies.leaveHoursPerDay,
    });
    if (capWarnings.length > 0) {
      const ok = window.confirm(
        capWarnings.map((w) => `${w.title}\n${w.detail}`).join('\n\n') + '\n\n確定仍要送出？'
      );
      if (!ok) return;
    }

    let startTime = formData.startTime;
    let endTime = formData.endTime;
    if (formData.period !== 'custom') {
      const times = periodToTimes(formData.period, previewShiftForCalc, shiftTimeConfig, storeConfig);
      startTime = times.startTime;
      endTime = times.endTime;
    }

    try {
      await addLeaveRequest(
        {
          employeeId: formEmployee.id,
          employeeName: formEmployee.name,
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
        },
        attachmentFiles
      );

      setShowForm(false);
      setTargetEmployeeId('');
      setAttachmentFiles([]);
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

  const calcDisplayHours = (req: (typeof leaveRequests)[number]) => {
    if (req.leaveHours > 0) return req.leaveHours;
    // 核准後班表可能已改寫：用 snapshot／原班別重算，避免顯示 0
    return calculateLeaveWorkHours({
      startDate: req.startDate,
      endDate: req.endDate,
      startTime: req.startTime,
      endTime: req.endTime,
      period: req.period,
      shiftMode: 'schedule',
      employeeId: req.employeeId,
      getShiftForDate: (date, employeeId) =>
        getOriginalShiftForLeaveDay({
          employeeId,
          date,
          shiftMode: req.shiftMode,
          scheduleSnapshot: req.scheduleSnapshot,
          getBaseShiftForDate: getShiftForDate,
        }),
      shiftTimeConfig,
      storeConfig,
    });
  };

  const handlePrintLeaveForm = (req: (typeof leaveRequests)[number]) => {
    try {
      printLeaveApplicationForm(
        buildLeaveFormPrintData(req, { leaveHours: calcDisplayHours(req) })
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : '列印失敗');
    }
  };

  const approvalChain = effectiveApprovalChain(
    storeConfig.policies.approvalChain,
    employees,
    activeSiteId
  );
  const approvalMode = storeConfig.policies.approvalMode;
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

  const siteEmployeeIds = useMemo(
    () => new Set(employees.map((e) => e.id)),
    [employees]
  );

  const visibleRequests = useMemo(() => {
    const scoped = isManager
      ? leaveRequests.filter((r) => siteEmployeeIds.has(r.employeeId))
      : leaveRequests.filter((r) => r.employeeId === currentUser?.id);
    return scoped.filter((r) => {
      if (!doesRangeOverlapYearMonth(r.startDate, r.endDate, filterYear, filterMonth)) {
        return false;
      }
      if (isManager && filterEmployeeId && r.employeeId !== filterEmployeeId) {
        return false;
      }
      return true;
    });
  }, [
    isManager,
    leaveRequests,
    currentUser?.id,
    filterYear,
    filterMonth,
    filterEmployeeId,
    siteEmployeeIds,
  ]);

  const filterHoursSummary = useMemo(() => {
    const approved = visibleRequests.filter((r) => r.status === 'approved');
    if (approved.length === 0) return '';
    const total = Math.round(
      approved.reduce((sum, r) => sum + calcDisplayHours(r), 0) * 100
    ) / 100;
    const nameHint =
      isManager && filterEmployeeId
        ? `${getEmpName(filterEmployeeId)} `
        : '';
    return `${nameHint}核准請假合計 ${total} 小時`;
    // calcDisplayHours / getEmpName 依閉包資料，與 visibleRequests 同步即可
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleRequests, isManager, filterEmployeeId, employees, shiftTimeConfig, getShiftForDate]);

  return (
    <div className="space-y-6">
      <div className="app-toolbar justify-between">
        <h2 className="app-page-title">請假申請</h2>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <button
            onClick={() => router.push('/applications/leave/annual-summary')}
            className="app-btn-outline"
          >
            年度特休總表
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            className="app-btn-primary"
          >
            {isManager ? '+ 新增／補登' : '+ 新增申請'}
          </button>
        </div>
      </div>

      <HelpTip
        title="請假申請說明"
        hint="如何送出與審核"
        storageKey={`help:leave-apply:${storageScope}`}
      >
        <p>• 點「新增申請」填寫日期、時段與假別後送出，店長／老闆審核後才會生效。</p>
        <p>• 可選全天／上午／下午／自訂時間；特休與補休會依餘額與規則計算。</p>
        <p>• 跨月後員工無法自行申請過去月份；店長可代為補登。</p>
        <p>• 若請假日與班表晚班衝突，建議先完成換班或確認代班，再送請假。</p>
      </HelpTip>

      {isManager && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
          跨月後員工無法自行申請過去月份；店長／老闆可在此手動補登請假（可代選員工）。
        </p>
      )}

      {currentUser && !isManager && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-900">
            <div className="font-semibold mb-2">年度特休時數</div>
            <div className="text-3xl font-bold text-blue-600">{annualBalance.toFixed(1)}</div>
            <div className="text-xs text-blue-700 mt-1">天數</div>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm text-emerald-900">
            <div className="font-semibold mb-2">可用補休時數</div>
            <div
              className={`text-3xl font-bold ${compBalance < 0 ? "text-amber-700" : "text-emerald-600"}`}
            >
              {compBalance}
            </div>
            <div className="text-xs text-emerald-700 mt-1">
              小時（可先請後補；負數＝已借支，之後加班選「補休」會加回）
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="app-panel p-6">
          <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
            {isManager && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">請假員工</label>
                <select
                  value={targetEmployeeId}
                  onChange={(e) => setTargetEmployeeId(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg"
                  required
                >
                  <option value="">請選擇員工</option>
                  {staffEmployees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">開始日期</label>
                <input
                  type="date"
                  value={formData.startDate}
                  min={dateMin}
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
                {isManager && (
                  <p className="text-xs text-gray-500 mt-1">可選過去月份日期（手動補登）</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">結束日期</label>
                <input
                  type="date"
                  value={formData.endDate}
                  min={formData.startDate || dateMin}
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
                    shiftMode: e.target.value as 'schedule' | string,
                  })
                }
                className="w-full px-4 py-2 border rounded-lg"
              >
                {shiftOptions.map((opt) => (
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
                {LEAVE_TYPE_OPTIONS.map((t) => {
                  const rule = effectiveLeaveRule(t, storeConfig.policies.leaveRules);
                  return (
                    <option key={t} value={t}>
                      {t}（{leavePayKindLabel(rule.payKind)}）
                    </option>
                  );
                })}
              </select>
              <p className="text-xs text-gray-600 mt-1">
                {leavePayKindLabel(selectedLeaveRule.payKind)} · {formatLeaveLimit(selectedLeaveRule)}
                {selectedLeaveRule.customized ? '（店規已改）' : ''}
                {' '}
                {selectedLeaveRule.legalRef}：{selectedLeaveRule.summary}
                超過上限只警示、不擋送出。
              </p>
              {formData.type === '特休' && (
                <p className="text-xs text-amber-700 mt-1">
                  目前特休剩餘 {annualBalance.toFixed(1)} 天（依年資配額）。
                </p>
              )}
              {formData.type === '補休假' && (
                <p className="text-xs text-amber-700 mt-1">
                  目前補休 {compBalance} 小時
                  {estimatedHours > 0 && compBalance < estimatedHours
                    ? `；核准後約為 ${Math.round((compBalance - estimatedHours) * 100) / 100} 小時（可先請後補）`
                    : '。可先請後補，餘額可為負，之後加班選「補休」加回。'}
                </p>
              )}
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

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                附件（選填）
              </label>
              <input
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                multiple
                onChange={(e) => {
                  const picked = Array.from(e.target.files ?? []);
                  setAttachmentFiles(picked.slice(0, 5));
                }}
                className="w-full text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">
                可上傳診斷書／證明（JPEG、PNG、PDF，單檔 ≤10MB，最多 5 個）
              </p>
              {attachmentFiles.length > 0 && (
                <ul className="mt-2 text-xs text-gray-700 space-y-1">
                  {attachmentFiles.map((f) => (
                    <li key={`${f.name}-${f.size}`}>{f.name}</li>
                  ))}
                </ul>
              )}
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

      <div className="app-panel overflow-hidden">
        <div className="p-4 border-b bg-gray-50 flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-medium text-gray-900">請假申請記錄</h3>
          <MonthFilterBar
            year={filterYear}
            month={filterMonth}
            onYearChange={setFilterYear}
            onMonthChange={setFilterMonth}
            count={visibleRequests.length}
            employeeFilter={
              isManager
                ? {
                    value: filterEmployeeId,
                    onChange: setFilterEmployeeId,
                    options: staffEmployees.map((e) => ({ id: e.id, name: e.name })),
                  }
                : undefined
            }
            summaryText={filterHoursSummary || undefined}
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
                <th className="p-4 text-left font-medium text-gray-700">附件</th>
                <th className="p-4 text-left font-medium text-gray-700">狀態</th>
                <th className="p-4 text-left font-medium text-gray-700">審核說明</th>
                <th className="p-4 text-left font-medium text-gray-700">簽名表</th>
                {isManager && <th className="p-4 text-left font-medium text-gray-700">操作</th>}
              </tr>
            </thead>
            <tbody className="divide-y">
              {visibleRequests.length === 0 && (
                <tr>
                  <td colSpan={isManager ? 11 : 10} className="p-8 text-center text-gray-500">
                    本月沒有請假申請
                  </td>
                </tr>
              )}
              {visibleRequests.map((req) => {
                const status = statusLabels[req.status];
                const statusText =
                  req.status === 'pending'
                    ? approvalPendingLabel(approvalChain, req.approvalStep ?? 0, approvalMode)
                    : status.label;
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
                    <td className="p-4 text-sm text-gray-600">
                      {(req.attachments?.length ?? 0) === 0 ? (
                        <span className="text-gray-400">—</span>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {req.attachments!.map((att) => (
                            <button
                              key={att.id}
                              type="button"
                              onClick={async () => {
                                try {
                                  await openLeaveAttachment(att.id);
                                } catch (err) {
                                  alert(err instanceof Error ? err.message : '無法開啟附件');
                                }
                              }}
                              className="text-left text-blue-600 hover:underline text-xs truncate max-w-[10rem]"
                              title={att.fileName}
                            >
                              {att.fileName}
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${status.color}`}>
                        {statusText}
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
                          {req.status === 'pending' &&
                            canActOnApprovalStep(
                              currentUser?.role,
                              currentApprovalRole(approvalChain, req.approvalStep ?? 0),
                              approvalMode,
                              currentUser?.capabilities
                            ) && (
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
                                alert(error instanceof Error ? error.message : '刪除失敗，請稍後再試。');
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
          <div className="app-panel p-6 w-full max-w-sm shadow-xl">
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
