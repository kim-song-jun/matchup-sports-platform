'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; href: string };
  secondaryAction?: { label: string; onClick: () => void };
  size?: 'sm' | 'md';
}

export function EmptyState({ icon: Icon, title, description, action, secondaryAction, size = 'md' }: EmptyStateProps) {
  const isSm = size === 'sm';
  const isAuthWall = action?.href === '/login';

  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${isSm ? 'p-8' : 'p-12'}`}
      data-testid={isAuthWall ? 'auth-wall' : undefined}
    >
      <div className={`flex items-center justify-center rounded-full bg-blue-50 dark:bg-blue-950/30 ${isSm ? 'h-12 w-12' : 'h-20 w-20'}`}>
        <Icon size={isSm ? 24 : 40} className="text-blue-400 dark:text-blue-300 animate-gentle-bounce" />
      </div>
      <h3 className={`font-semibold text-gray-700 dark:text-gray-200 ${isSm ? 'mt-3 text-base' : 'mt-5 text-lg'}`}>
        {title}
      </h3>
      {description && (
        <p className={`text-gray-500 dark:text-gray-400 ${isSm ? 'mt-1 text-sm' : 'mt-1.5 text-base'}`}>
          {description}
        </p>
      )}
      {action && (
        <Link
          href={action.href}
          data-testid={isAuthWall ? 'auth-wall-login-link' : undefined}
          className="mt-5 inline-flex items-center min-h-[44px] rounded-xl border border-blue-200 dark:border-blue-800 px-4 py-2 text-base font-medium text-blue-500 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
        >
          {action.label}
        </Link>
      )}
      {secondaryAction && (
        <button
          onClick={secondaryAction.onClick}
          className="mt-2 min-h-[44px] px-3 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
        >
          {secondaryAction.label}
        </button>
      )}
    </div>
  );
}
