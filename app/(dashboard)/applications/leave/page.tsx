'use client';

import { useState } from 'react';
import { useApp, EMPLOYEES } from '@/lib/context/AppContext';

export default function LeaveApplicationPage() {
  const { currentUser, leaveRequests, addLeaveRequest, updateLeaveRequestStatus } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    date: '',
    period: '全天' as const,
    type: '事假' as const,
    reason: '',
  });

  const isManager = currentUser?.role === 'owner' || currentUser?.role === 'manager';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    
    addLeaveRequest({
      employeeId: currentUser.id,
      employeeName: currentUser.name,
      date: formData.date,
      period: formData.period,
      type: formData.type,
      reason: formData.reason,
      status: 'pending',
    });
    
    setShowForm(false);
    setFormData({ date: '', period: '全天', type: '事假', reason: '' });
  };

  const statusLabels: Record<string, { label: string; color: string }> = {
    pending: { label: '待審核', color: 'bg-yellow-100 text-yellow-800' },
    approved: { label: '已核准', color: 'bg-green-100 text-green-800' },
    rejected: { label: '已駁回', color: 'bg-red-100 text-red-800' },
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">請假申請</h2>
        <button 
          onClick={() => setShowForm(!showForm)} 
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          + 新增申請
        </button>
      </div>

      {/* 表單 */}
      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">請假日期</label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">時段</label>
              <select
                value={formData.period}
                onChange={(e) => setFormData({ ...formData, period: e.target.value as any })}
                className="w-full px-4 py-2 border rounded-lg"
              >
                <option value="全天">全天</option>
                <option value="上午">上午</option>
                <option value="下午">下午</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">假別</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                className="w-full px-4 py-2 border rounded-lg"
              >
                <option value="事假">事假</option>
                <option value="病假">病假</option>
                <option value="特休">特休</option>
                <option value="其他">其他</option>
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

      {/* 列表 */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-4 text-left text-sm font-medium text-gray-700">日期</th>
              <th className="p-4 text-left text-sm font-medium text-gray-700">員工</th>
              <th className="p-4 text-left text-sm font-medium text-gray-700">時段</th>
              <th className="p-4 text-left text-sm font-medium text-gray-700">假別</th>
              <th className="p-4 text-left text-sm font-medium text-gray-700">事由</th>
              <th className="p-4 text-left text-sm font-medium text-gray-700">狀態</th>
              {isManager && (
                <th className="p-4 text-left text-sm font-medium text-gray-700">操作</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y">
            {leaveRequests.map((request) => {
              const status = statusLabels[request.status];
              return (
                <tr key={request.id} className="hover:bg-gray-50">
                  <td className="p-4 text-sm text-gray-600">{request.date}</td>
                  <td className="p-4 text-sm text-gray-900 font-medium">{request.employeeName}</td>
                  <td className="p-4 text-sm text-gray-600">{request.period}</td>
                  <td className="p-4 text-sm text-gray-600">{request.type}</td>
                  <td className="p-4 text-sm text-gray-600 max-w-xs truncate">{request.reason}</td>
                  <td className="p-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${status.color}`}>
                      {status.label}
                    </span>
                  </td>
                  {isManager && request.status === 'pending' && (
                    <td className="p-4">
                      <div className="flex gap-2">
                        <button
                          onClick={() => updateLeaveRequestStatus(request.id, 'approved')}
                          className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                        >
                          核准
                        </button>
                        <button
                          onClick={() => updateLeaveRequestStatus(request.id, 'rejected')}
                          className="px-3 py-1 border rounded text-sm hover:bg-gray-50"
                        >
                          駁回
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        {leaveRequests.length === 0 && (
          <div className="p-8 text-center text-gray-500">
            沒有請假申請
          </div>
        )}
      </div>
    </div>
  );
}
