    'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/types';
import { CheckCircle2, XCircle, Clock, Calendar } from 'lucide-react';

type Notification = Database['public']['Tables']['notifications']['Row'];

const typeIcons = {
  leave_submitted: Calendar,
  leave_reviewed: CheckCircle2,
  shift_swap_requested: Clock,
  shift_swap_confirmed: CheckCircle2,
  shift_swap_reviewed: CheckCircle2,
  overtime_submitted: Clock,
  overtime_reviewed: CheckCircle2,
  schedule_changed: Calendar,
};

const typeColors = {
  leave_submitted: 'text-blue-500 bg-blue-50',
  leave_reviewed: 'text-green-500 bg-green-50',
  shift_swap_requested: 'text-yellow-500 bg-yellow-50',
  shift_swap_confirmed: 'text-green-500 bg-green-50',
  shift_swap_reviewed: 'text-green-500 bg-green-50',
  overtime_submitted: 'text-yellow-500 bg-yellow-50',
  overtime_reviewed: 'text-green-500 bg-green-50',
  schedule_changed: 'text-blue-500 bg-blue-50',
};

export function NotificationList() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    loadNotifications();
  }, []);

  const loadNotifications = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('recipient_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (!error && data) {
      setNotifications(data);
    }
    setLoading(false);
  };

  const markAsRead = async (id: string) => {
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id);

    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, is_read: true } : n)
    );
  };

  const markAllAsRead = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('recipient_id', session.user.id)
      .eq('is_read', false);

    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-gray-500">
        載入中...
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">通知</h1>
        {notifications.some(n => !n.is_read) && (
          <button
            onClick={markAllAsRead}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            全部標示為已讀
          </button>
        )}
      </div>

      <div className="space-y-3">
        {notifications.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            目前沒有通知
          </div>
        ) : (
          notifications.map((notification) => {
            const Icon = typeIcons[notification.type as keyof typeof typeIcons] || Calendar;
            const colorClass = typeColors[notification.type as keyof typeof typeColors] || 'text-gray-500 bg-gray-50';

            return (
              <div
                key={notification.id}
                onClick={() => !notification.is_read && markAsRead(notification.id)}
                className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                  notification.is_read
                    ? 'bg-white border-gray-200'
                    : 'bg-blue-50 border-blue-200'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${colorClass}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-gray-900">
                      {notification.title}
                    </h3>
                    <p className="text-sm text-gray-600 mt-1">
                      {notification.body}
                    </p>
                    <p className="text-xs text-gray-400 mt-2">
                      {new Date(notification.created_at).toLocaleString('zh-TW')}
                    </p>
                  </div>
                  {!notification.is_read && (
                    <div className="w-2 h-2 bg-blue-500 rounded-full mt-2" />
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
