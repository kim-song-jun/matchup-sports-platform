import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';

interface AdminEmptyProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function AdminEmpty({ icon, title, description, action }: AdminEmptyProps) {
  return (
    <div className="flex flex-col items-center justify-center py-14 gap-2 text-center px-5">
      <span className="text-gray-300 mb-1" aria-hidden="true">
        {icon ?? <Inbox size={40} />}
      </span>
      <p className="tm-text-body font-semibold [color:var(--text-muted)]">{title}</p>
      {description && <p className="tm-text-caption">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
