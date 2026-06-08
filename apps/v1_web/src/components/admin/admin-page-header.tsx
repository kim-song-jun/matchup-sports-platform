import type { ReactNode } from 'react';

interface AdminPageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function AdminPageHeader({ eyebrow, title, description, action }: AdminPageHeaderProps) {
  return (
    <div className="flex justify-between items-start mb-6">
      <div>
        {eyebrow && (
          <p className="text-[12px] font-semibold text-blue-500 tracking-wide uppercase mb-1">
            {eyebrow}
          </p>
        )}
        <h1 className="text-[22px] font-bold text-gray-900">{title}</h1>
        {description && (
          <p className="text-[14px] text-gray-500 mt-1">{description}</p>
        )}
      </div>
      {action && <div className="ml-4 flex-shrink-0">{action}</div>}
    </div>
  );
}
