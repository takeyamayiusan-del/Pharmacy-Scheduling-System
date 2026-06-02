import type { StaffingStatus } from '@/lib/scheduling/staffing';

interface StaffingAlertProps {
  status: StaffingStatus;
}

const statusConfig = {
  critical: { color: 'bg-red-100 text-red-700', icon: '🔴', label: '人力嚴重不足' },
  warning: { color: 'bg-yellow-100 text-yellow-700', icon: '🟡', label: '人力不足' },
  normal: { color: 'bg-green-100 text-green-700', icon: '✅', label: '人力正常' },
  excess: { color: 'bg-blue-100 text-blue-700', icon: 'ℹ️', label: '人力充裕' },
};

export function StaffingAlert({ status }: StaffingAlertProps) {
  const config = statusConfig[status];

  return (
    <div className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${config.color}`}>
      <span>{config.icon}</span>
      <span>{config.label}</span>
    </div>
  );
}
