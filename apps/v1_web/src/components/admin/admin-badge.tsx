interface AdminBadgeProps {
  status: string;
  label?: string;
}

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  open: { label: '모집중', className: 'bg-blue-50 text-blue-600' },
  recruiting: { label: '모집중', className: 'bg-blue-50 text-blue-600' },
  active: { label: '진행중', className: 'bg-green-50 text-green-600' },
  ongoing: { label: '진행중', className: 'bg-green-50 text-green-600' },
  confirmed: { label: '확정', className: 'bg-green-50 text-green-600' },
  completed: { label: '완료', className: 'bg-green-50 text-green-600' },
  done: { label: '완료', className: 'bg-green-50 text-green-600' },
  closed: { label: '종료', className: 'bg-gray-100 text-gray-500' },
  expired: { label: '만료', className: 'bg-gray-100 text-gray-500' },
  full: { label: '마감', className: 'bg-gray-100 text-gray-500' },
  cancelled: { label: '취소됨', className: 'bg-gray-100 text-gray-500' },
  pending: { label: '대기중', className: 'bg-amber-50 text-amber-600' },
  waiting: { label: '대기중', className: 'bg-amber-50 text-amber-600' },
  matched: { label: '매칭됨', className: 'bg-amber-50 text-amber-600' },
  rejected: { label: '거절됨', className: 'bg-red-50 text-red-500' },
  failed: { label: '실패', className: 'bg-red-50 text-red-500' },
  owner: { label: '팀장', className: 'bg-blue-50 text-blue-600' },
  manager: { label: '운영진', className: 'bg-amber-50 text-amber-600' },
  member: { label: '멤버', className: 'bg-gray-100 text-gray-500' },
  read: { label: '읽음', className: 'bg-gray-100 text-gray-500' },
  created: { label: '새 알림', className: 'bg-blue-50 text-blue-600' },
  ready: { label: '작성 가능', className: 'bg-amber-50 text-amber-600' },
};

export function AdminBadge({ status, label }: AdminBadgeProps) {
  const mapping = STATUS_MAP[status];
  const displayLabel = label ?? mapping?.label ?? status;
  const className = mapping?.className ?? 'bg-gray-100 text-gray-500';

  return (
    <span
      className={`inline-block text-[11px] font-bold rounded-full px-2 py-0.5 whitespace-nowrap ${className}`}
    >
      {displayLabel}
    </span>
  );
}
