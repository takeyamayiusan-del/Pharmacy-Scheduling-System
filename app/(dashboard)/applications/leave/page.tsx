'use client';

import { useState } from 'react';
import { useApp } from '@/lib/context/AppContext';

type LeaveType = '事假' | '病假' | '特休' | '其他';

// 根據班別時間計算請假時數（班別時段的總時數）
function calcLeaveHoursByShiftTimes(shiftTimes: string[]): number {
  let total = 0;
  for (const seg of shiftTimes) {
    if (seg === '休假') continue;
    const [s, e] = seg.split('-');
    if (!s || !e) continue;
    const [sh, sm] = s.split(':').map(Number);
    const [eh, em] = e.split(':').map(Number);
    total += (eh * 60 + em - (sh * 60 + sm)) / 60;
  }
  return Math.round(total * 100) / 100;
}

const PERIOD_OPTIONS = [
  { label: '全天', value: 'full_day' },
  { label: '上午', value: 'morning' },
  { label: '下午', value: 'afternoon' },
] as const;
type Period = 'full_day' | 'morning' | 'afternoon';

export default function LeaveApplicationPage() {
  const {
    currentUser, employees, leaveRequests,
    addLeaveRequest, updateLeaveRequestStatus, deleteLeaveRequest,
    shiftTimeConfig,
  } = useApp();

  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    date: '',
    period: 'full_day' as Period,
    type: '事假' as LeaveType,
    reason: '',
  });
  const [rejectModal, setRejectModal] = useState<{ id: string; reason: string } | null>(null);
  const isManager = currentUser?.role === 'owner' || currentUser?.role === 'manager';

  // 根據 period 計算請假時數（用 shiftTimeConfig 的班別時間）
  const calcHoursByPeriod = (period: Period): number => {
    if (period === 'full_day') return calcLeaveHoursByShiftTimes(shiftTimeConfig.B);
    if (period === 'morning') return calcLeaveHoursByShiftTimes(shiftTimeConfig.C);
    if (period === 'afternoon') return calcLeaveHoursByShiftTimes(shiftTimeConfig.D);
    return 0;
  };

  const periodLabel = { full_day: '全天', morning: '上午', afternoon: '下午' };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !formData.date) return;

    const timeMap = {
      full_day: { startTime: '08:30', endTime: '21:00' },
      morning: { startTime: '08:30', endTime: '12:00' },
      afternoon: { startTime: '13:30', endTime: '18:00' },
    };
    const times = timeMap[formData.period];

    addLeaveRequest({
      employeeId: currentUser.id,
      employeeName: currentUser.name,
      startDate: formData.date,
      endDate: formData.date,
      startTime: times.startTime,
      endTime: times.endTime,
      type: formData.type,
      reason: formData.reason,
      status: 'pending',
    });

    setShowForm(false);
    setFormData({ date: '', period: 'full_day', type: '事假', reason: '' });
  };

  const handleReject = async () => {
    if (!rejectModal) return;
    await updateLeaveRequestStatus(rejectModal.id, 'rejected', rejectModal.reason);
    setRejectModal(null);
  };

  const statusLabels: Record<string, { label: string; color: string }> = {
    pending:  { label: '待審核', color: 'bg-yellow-100 text-yellow-800' },
    approved: { label: '已核准', color: 'bg-green-100 text-green-800' },
    rejected: { label: '已駁回', color: 'bg-red-100 text-red-800' },
  };

  const getEmpName = (id: string) => employees.find(e => e.id === id)?.name ?? id;

  // 依權限過濾顯示的申請
  const visibleRequests = isManager
    ? leaveRequests
    : leaveRequests.filter(r => r.employeeId === currentUser?.id);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">請假申請</h2>
        {currentUser?.role !== 'owner' && (
          <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            + 新增申請
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">請假日期</label>
              <input type="date" value={formData.date}
                onChange={e => setFormData({ ...formData, date: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">請假時段</label>
              <div className="flex gap-3">
                {PERIOD_OPTIONS.map(opt => (
                  <label key={opt.value} className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" name="period" value={opt.value}
                      checked={formData.period === opt.value}
                      onChange={() => setFormData({ ...formData, period: opt.value })} />
                    <span className="text-sm">{opt.label}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                預估請假時數：{calcHoursByPeriod(formData.period)} 小時
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">假別</label>
              <select value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value as LeaveType })}
                className="w-full px-4 py-2 border rounded-lg">
                <option value="事假">事假</option>
                <option value="病假">病假</option>
                <option value="特休">特休</option>
                <option value="其他">其他</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">事由</label>
              <textarea value={formData.reason} onChange={e => setFormData({ ...formData, reason: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg" rows={3} required />
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border rounded-lg hover:bg-gray-50">取消</button>
              <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">送出申請</button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-4 text-left font-medium text-gray-700">員工</th>
                <th className="p-4 text-left font-medium text-gray-700">日期</th>
                <th className="p-4 text-left font-medium text-gray-700">時段</th>
                <th className="p-4 text-left font-medium text-gray-700">時數</th>
                <th className="p-4 text-left font-medium text-gray-700">假別</th>
                <th className="p-4 text-left font-medium text-gray-700">事由</th>
                <th className="p-4 text-left font-medium text-gray-700">狀態</th>
                {isManager && <th className="p-4 text-left font-medium text-gray-700">操作</th>}
              </tr>
            </thead>
            <tbody className="divide-y">
              {visibleRequests.length === 0 && (
                <tr><td colSpan={8} className="p-8 text-center text-gray-500">沒有請假申請</td></tr>
              )}
              {visibleRequests.map(req => {
                const status = statusLabels[req.status];
                // 時段判斷
                const period = req.startTime === '08:30' && req.endTime === '12:00' ? 'morning'
                  : req.startTime === '13:30' ? 'afternoon' : 'full_day';
                const hours = calcHoursByPeriod(period);
                const empName = req.employeeName || getEmpName(req.employeeId);

                return (
                  <tr key={req.id} className="hover:bg-gray-50">
                    <td className="p-4 font-medium text-gray-900">{empName}</td>
                    <td className="p-4 text-gray-600">{req.startDate}</td>
                    <td className="p-4 text-gray-600">{periodLabel[period as Period] ?? '全天'}</td>
                    <td className="p-4 text-gray-600">{hours} 小時</td>
                    <td className="p-4 text-gray-600">{req.type}</td>
                    <td className="p-4 text-gray-600 max-w-xs truncate">{req.reason}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${status.color}`}>
                        {status.label}
                      </span>
                    </td>
                    {isManager && (
                      <td className="p-4">
                        <div className="flex gap-1 flex-wrap">
                          {req.status === 'pending' && (
                            <>
                              <button onClick={() => updateLeaveRequestStatus(req.id, 'approved')}
                                className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700">核准</button>
                              <button onClick={() => setRejectModal({ id: req.id, reason: '' })}
                                className="px-2 py-1 bg-orange-500 text-white rounded text-xs hover:bg-orange-600">駁回</button>
                            </>
                          )}
                          {req.status !== 'pending' && (
                            <button onClick={() => updateLeaveRequestStatus(req.id, 'pending' as 'approved')}
                              className="px-2 py-1 border rounded text-xs hover:bg-gray-50">取消審核</button>
                          )}
                          <button onClick={() => { if (confirm('確定刪除？')) deleteLeaveRequest(req.id); }}
                            className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs hover:bg-red-200">刪除</button>
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

      {/* 駁回原因 Modal */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="font-semibold text-gray-900 mb-3">填寫駁回原因</h3>
            <textarea
              value={rejectModal.reason}
              onChange={e => setRejectModal({ ...rejectModal, reason: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm mb-3"
              rows={3} placeholder="請輸入駁回原因（選填）"
            />
            <div className="flex gap-2">
              <button onClick={handleReject} className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700">確認駁回</button>
              <button onClick={() => setRejectModal(null)} className="flex-1 py-2 border rounded-lg text-sm">取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
