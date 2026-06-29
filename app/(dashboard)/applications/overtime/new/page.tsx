'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { overtimeApplicationSchema } from '@/lib/validation/schemas';
import { useApp } from '@/lib/context/AppContext';

export default function NewOvertimeApplicationPage() {
  const { currentUser, getPunchRecordsByDate } = useApp();
  const [formData, setFormData] = useState({
    overtime_date: new Date().toISOString().split('T')[0],
    start_time: '09:00',
    end_time: '18:00',
    reason: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const validation = overtimeApplicationSchema.safeParse(formData);
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

      const { error } = await supabase.from('overtime_applications').insert({
        user_id: session.user.id,
        ...formData,
        status: 'pending',
      });

      if (error) throw error;
      router.push('/applications/overtime');
    } catch {
      setErrors({ submit: '申請失敗，請稍後再試' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">新增加班申請</h1>
        <p className="text-gray-600 mt-1">填寫加班資訊</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-sm font-medium text-gray-700">
                加班日期
              </label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  if (!currentUser) return;
                  const records = getPunchRecordsByDate(currentUser.id, formData.overtime_date);
                  if (records.length >= 2) {
                    const firstIn = records.find(r => r.action === 'work_in');
                    const lastOut = [...records].reverse().find(r => r.action === 'work_out');
                    if (firstIn && lastOut) {
                      setFormData({
                        ...formData,
                        start_time: firstIn.time.substring(0, 5),
                        end_time: lastOut.time.substring(0, 5)
                      });
                    }
                  } else {
                    alert('當日打卡紀錄不足（需包含上班與下班）');
                  }
                }}
              >
                帶入打卡時間
              </Button>
            </div>
            <input
              type="date"
              value={formData.overtime_date}
              onChange={(e) => setFormData({ ...formData, overtime_date: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            {errors.overtime_date && (
              <p className="text-red-500 text-sm mt-1">{errors.overtime_date}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                開始時間
              </label>
              <input
                type="time"
                value={formData.start_time}
                onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
              {errors.start_time && (
                <p className="text-red-500 text-sm mt-1">{errors.start_time}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                結束時間
              </label>
              <input
                type="time"
                value={formData.end_time}
                onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
              {errors.end_time && (
                <p className="text-red-500 text-sm mt-1">{errors.end_time}</p>
              )}
            </div>
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
              placeholder="請輸入加班事由（最多 200 字）"
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
