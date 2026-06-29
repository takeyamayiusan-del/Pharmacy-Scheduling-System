'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { leaveApplicationSchema } from '@/lib/validation/schemas';
import { useApp } from '@/lib/context/AppContext';

type LeavePeriod = 'full_day' | 'morning' | 'afternoon';

function inferLeavePeriod(startTime: string, endTime: string): LeavePeriod {
  if (startTime === '08:30' && endTime === '12:00') return 'morning';
  if (startTime === '13:30' && endTime === '17:00') return 'afternoon';
  return 'full_day';
}

export default function NewLeaveApplicationPage() {
  const [formData, setFormData] = useState<{
    leave_date: string;
    start_time: string;
    end_time: string;
    leave_type: string;
    reason: string;
  }>({
    leave_date: new Date().toISOString().split('T')[0],
    start_time: '08:30',
    end_time: '17:00',
    leave_type: '',
    reason: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();
  const { currentUser, getAnnualLeaveBalance, getCompLeaveBalance } = useApp();
  const compBalance = currentUser ? getCompLeaveBalance(currentUser.id) : 0;
  const annualBalance = currentUser ? getAnnualLeaveBalance(currentUser.id, new Date().getFullYear()) : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    if (formData.end_time <= formData.start_time) {
      setErrors({ end_time: '結束時間必須晚於開始時間' });
      return;
    }

    const period = inferLeavePeriod(formData.start_time, formData.end_time);
    const reasonWithTime = `${formData.reason.trim()}\n請假時段：${formData.start_time}-${formData.end_time}`.trim();

    const validation = leaveApplicationSchema.safeParse({
      leave_date: formData.leave_date,
      period,
      leave_type: formData.leave_type,
      reason: reasonWithTime,
    });
    if (!validation.success) {
      const newErrors: Record<string, string> = {};
      validation.error.errors.forEach((err) => {
        if (err.path[0]) {
          newErrors[err.path[0].toString()] = err.message;
        }
      });
      setErrors(newErrors);
      return;
    }

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('未登入');

      const { error } = await supabase.from('leave_applications').insert({
        user_id: session.user.id,
        leave_date: formData.leave_date,
        period,
        leave_type: formData.leave_type,
        reason: reasonWithTime,
        status: 'pending',
      });

      if (error) throw error;
      router.push('/applications/leave');
    } catch {
      setErrors({ submit: '申請失敗，請稍後再試' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">新增請假申請</h1>
        <p className="text-gray-600 mt-1">填寫請假資訊</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              請假日期
            </label>
            <input
              type="date"
              value={formData.leave_date}
              onChange={(e) => setFormData({ ...formData, leave_date: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            {errors.leave_date && (
              <p className="text-red-500 text-sm mt-1">{errors.leave_date}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              請假時段
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">開始</label>
                <input
                  type="time"
                  value={formData.start_time}
                  onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">結束</label>
                <input
                  type="time"
                  value={formData.end_time}
                  onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            {errors.end_time && (
              <p className="text-red-500 text-sm mt-1">{errors.end_time}</p>
            )}
            <p className="text-xs text-gray-500 mt-2">
              送出後會自動判定為全天/上午/下午，並附上你填寫的起訖時段。
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              假別
            </label>
            <select
              value={formData.leave_type}
              onChange={(e) => setFormData({ ...formData, leave_type: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">請選擇</option>
              <option value="事假">事假</option>
              <option value="病假">病假</option>
              <option value="特休">特休</option>
              <option value="其他">其他</option>
            </select>
            {errors.leave_type && (
              <p className="text-red-500 text-sm mt-1">{errors.leave_type}</p>
            )}
          </div>

          {/* 餘額顯示 */}
          {formData.leave_type === '補休假' && (
            <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg flex items-center justify-between">
              <span className="text-sm text-blue-700 font-medium">可用補休餘額</span>
              <span className="text-lg font-bold text-blue-700">{compBalance} 小時</span>
            </div>
          )}
          {formData.leave_type === '特休' && (
            <div className="p-3 bg-green-50 border border-green-100 rounded-lg flex items-center justify-between">
              <span className="text-sm text-green-700 font-medium">本年度剩餘特休</span>
              <span className="text-lg font-bold text-green-700">{annualBalance} 天</span>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              事由
            </label>
            <textarea
              value={formData.reason}
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
              rows={4}
              maxLength={200}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="請輸入請假事由（最多 200 字）"
            />
            <p className="text-xs text-gray-400 mt-1">
              {formData.reason.length}/200
            </p>
            {errors.reason && (
              <p className="text-red-500 text-sm mt-1">{errors.reason}</p>
            )}
          </div>

          {errors.submit && (
            <p className="text-red-500 text-sm">{errors.submit}</p>
          )}

          <div className="flex gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => router.back()}
            >
              取消
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? '申請中...' : '送出申請'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
