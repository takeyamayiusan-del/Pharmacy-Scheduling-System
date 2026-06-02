'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import type { Database } from '@/lib/supabase/types';

type TardinessRecord = Database['public']['Tables']['tardiness_records']['Row'];
type User = Database['public']['Tables']['users']['Row'];

export function TardinessTable() {
  const [records, setRecords] = useState<TardinessRecord[]>([]);
  const [users, setUsers] = useState<Record<string, User>>({});
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    record_date: new Date().toISOString().split('T')[0],
    user_id: '',
    minutes_late: 1,
    note: '',
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [usersRes, recordsRes] = await Promise.all([
      supabase.from('users').select('*').eq('is_active', true),
      supabase.from('tardiness_records').select('*').order('record_date', { ascending: false }),
    ]);

    if (usersRes.data) {
      const userMap: Record<string, User> = {};
      usersRes.data.forEach((u) => { userMap[u.id] = u; });
      setUsers(userMap);
    }
    if (recordsRes.data) setRecords(recordsRes.data);
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('未登入');

      const { error } = await supabase.from('tardiness_records').insert({
        ...formData,
        recorded_by: session.user.id,
      });

      if (error) throw error;
      await loadData();
      setShowForm(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12 text-gray-500">
        載入中...
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border">
      <div className="p-4 border-b flex justify-between items-center">
        <h2 className="text-xl font-bold text-gray-900">遲到紀錄</h2>
        <Button onClick={() => setShowForm(!showForm)}>
          {showForm ? '取消' : '新增紀錄'}
        </Button>
      </div>

      {showForm && (
        <div className="p-4 border-b bg-gray-50">
          <form onSubmit={handleSubmit} className="max-w-lg space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                日期
              </label>
              <input
                type="date"
                value={formData.record_date}
                onChange={(e) => setFormData({ ...formData, record_date: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                員工
              </label>
              <select
                value={formData.user_id}
                onChange={(e) => setFormData({ ...formData, user_id: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                required
              >
                <option value="">請選擇</option>
                {Object.values(users).map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                遲到分鐘數
              </label>
              <input
                type="number"
                min="1"
                max="999"
                value={formData.minutes_late}
                onChange={(e) => setFormData({ ...formData, minutes_late: parseInt(e.target.value) || 1 })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                備註
              </label>
              <textarea
                value={formData.note}
                onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                rows={2}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div className="flex gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowForm(false)}
              >
                取消
              </Button>
              <Button type="submit" disabled={submitting || !formData.user_id}>
                {submitting ? '新增中...' : '新增'}
              </Button>
            </div>
          </form>
        </div>
      )}

      {records.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          目前沒有遲到紀錄
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  日期
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  員工
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  遲到分鐘數
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  備註
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {records.map((record) => (
                <tr key={record.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {new Date(record.record_date).toLocaleDateString('zh-TW')}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {users[record.user_id]?.name || '-'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {record.minutes_late} 分鐘
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {record.note || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
