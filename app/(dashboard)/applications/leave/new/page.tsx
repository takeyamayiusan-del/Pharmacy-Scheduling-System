'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { leaveApplicationSchema } from '@/lib/validation/schemas';
import type { LeaveApplicationInput } from '@/lib/validation/schemas';

export default function NewLeaveApplicationPage() {
  const [formData, setFormData] = useState({
    leave_date: new Date().toISOString().split('T')[0],
    period: 'full_day' as const,
    leave_type: '',
    reason: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const validation = leaveApplicationSchema.safeParse(formData);
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
        ...formData,
        status: 'pending',
      });

      if (error) throw error;
      router.push('/dashboard/applications/leave');
    } catch (err) {
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
              時段
            </label>
            <select
              value={formData.period}
              onChange={(e) => setFormData({ ...formData, period: e.target.value as any })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="full_day">全天</option>
              <option value="morning">上午</option>
              <option value="afternoon">下午</option>
            </select>
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
