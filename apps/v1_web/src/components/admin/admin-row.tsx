import Link from 'next/link';
import type { ReactNode } from 'react';

interface AdminRowProps {
  title: string;
  meta?: string;
  badge?: ReactNode;
  actions?: ReactNode;
  href?: string;
  leftIcon?: string;
  onClick?: () => void;
}

export function AdminRow({ title, meta, badge, actions, href, leftIcon, onClick }: AdminRowProps) {
  return (
    <div
      className="flex items-center gap-3 px-5 py-[14px] hover:bg-gray-50 border-b border-gray-50 last:border-0 transition-colors min-h-[44px]"
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') onClick();
            }
          : undefined
      }
    >
      {leftIcon && (
        <span className="text-xl leading-none flex-shrink-0" aria-hidden="true">
          {leftIcon}
        </span>
      )}
      <div className="flex-1 min-w-0">
        {href ? (
          <Link
            href={href}
            className="text-[15px] font-semibold text-gray-900 hover:text-blue-600 transition-colors truncate block"
          >
            {title}
          </Link>
        ) : (
          <span className="text-[15px] font-semibold text-gray-900 truncate block">{title}</span>
        )}
        {meta && (
          <span className="text-[13px] text-gray-500 truncate block">{meta}</span>
        )}
      </div>
      {badge && <div className="flex-shrink-0">{badge}</div>}
      {actions && <div className="flex-shrink-0 flex items-center gap-2">{actions}</div>}
    </div>
  );
}
