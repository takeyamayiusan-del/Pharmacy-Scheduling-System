import type { ApplicationStatus } from '@/lib/supabase/types';

interface ApplicationStatusBadgeProps {
  status: ApplicationStatus;
}

const statusConfig: Record<ApplicationStatus, { label: string; class: string }> = {
  pending: { label: '待審核', class: 'bg-yellow-100 text-yellow-800' },
  approved: { label: '已核准', class: 'bg-green-100 text-green-800' },
  rejected: { label: '已駁回', class: 'bg-red-100 text-red-800' },
};

export function ApplicationStatusBadge({ status }: ApplicationStatusBadgeProps) {
  const config = statusConfig[status];
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.class}`}>
      {config.label}
    </span>
  );
}
