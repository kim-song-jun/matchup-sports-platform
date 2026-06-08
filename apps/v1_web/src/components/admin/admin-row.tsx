import Link from 'next/link';
import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

interface AdminRowProps {
  title: string;
  meta?: string;
  badge?: ReactNode;
  actions?: ReactNode;
  href?: string;
  leftIcon?: ReactNode;
  onClick?: () => void;
  chevron?: boolean;
}

export function AdminRow({ title, meta, badge, actions, href, leftIcon, onClick, chevron }: AdminRowProps) {
  const showChevron = chevron ?? (!!href && !actions);

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0 transition-colors min-h-[52px] ${
        onClick || href ? 'hover:bg-gray-50 cursor-pointer' : ''
      }`}
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
        <span className="flex-shrink-0 text-gray-400" aria-hidden="true">
          {leftIcon}
        </span>
      )}
      <div className="flex-1 min-w-0">
        {href ? (
          <Link
            href={href}
            className="text-[15px] font-semibold text-gray-900 hover:text-blue-600 transition-colors line-clamp-1 block"
          >
            {title}
          </Link>
        ) : (
          <span className="text-[15px] font-semibold text-gray-900 line-clamp-1 block">{title}</span>
        )}
        {meta && (
          <span className="text-[13px] text-gray-400 line-clamp-1 block mt-0.5">{meta}</span>
        )}
      </div>
      {badge && <div className="flex-shrink-0">{badge}</div>}
      {actions && <div className="flex-shrink-0 flex items-center gap-2">{actions}</div>}
      {showChevron && !actions && (
        <ChevronRight size={16} className="flex-shrink-0 text-gray-300" />
      )}
    </div>
  );
}
