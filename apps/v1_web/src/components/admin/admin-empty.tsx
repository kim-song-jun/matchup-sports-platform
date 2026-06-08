import type { ReactNode } from 'react';

interface AdminEmptyProps {
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function AdminEmpty({ icon = '📭', title, description, action }: AdminEmptyProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-2 text-center px-5">
      <span className="text-4xl mb-2" aria-hidden="true">
        {icon}
      </span>
      <p className="text-[16px] font-semibold text-gray-700">{title}</p>
      {description && <p className="text-[13px] text-gray-400">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
