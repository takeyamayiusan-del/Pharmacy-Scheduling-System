'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import type { Database } from '@/lib/supabase/types';

type User = Database['public']['Tables']['users']['Row'];

export default function NewShiftSwapApplicationPage() {
  const [formData, setFormData] = useState({
    swap_date: new Date().toISOString().split('T')[0],
    target_id: '',
  });
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [usersLoading, setUsersLoading] = useState(true);
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const source = searchParams.get('source');
  const sourceNote = searchParams.get('source_note');

  useEffect(() => {
    const swapDate = searchParams.get('swap_date');
    const targetId = searchParams.get('target_id');
    if (!swapDate && !targetId) return;

    setFormData((prev) => ({
      swap_date: swapDate || prev.swap_date,
      target_id: targetId || prev.target_id,
    }));
  }, [searchParams]);

  const loadUsers = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('is_active', true)
      .neq('id', session.user.id)
      .order('name');

    if (data) setUsers(data);
    setUsersLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('未登入');

      const { error } = await supabase.from('shift_swap_applications').insert({
        requester_id: session.user.id,
        ...formData,
        status: 'pending_confirm',
      });

      if (error) throw error;
      router.push('/dashboard/applications/shift-swap');
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (usersLoading) {
    return (
      <div className="text-center py-12 text-gray-500">
        載入中...
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">新增換班申請</h1>
        <p className="text-gray-600 mt-1">填寫換班資訊</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border p-6">
        {source === 'wednesday_conflict' && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {sourceNote || '由禮三晚班衝突引導建立'}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              換班日期
            </label>
            <input
              type="date"
              value={formData.swap_date}
              onChange={(e) => setFormData({ ...formData, swap_date: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              換班對象
            </label>
            <select
              value={formData.target_id}
              onChange={(e) => setFormData({ ...formData, target_id: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">請選擇</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => router.back()}
            >
              取消
            </Button>
            <Button type="submit" disabled={loading || !formData.target_id}>
              {loading ? '申請中...' : '送出申請'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
