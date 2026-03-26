'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; href: string };
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-950/30">
        <Icon size={40} className="text-blue-400 dark:text-blue-300 animate-gentle-bounce" />
      </div>
      <h3 className="mt-5 text-[16px] font-semibold text-gray-700 dark:text-gray-200">
        {title}
      </h3>
      {description && (
        <p className="mt-1.5 text-[14px] text-gray-500 dark:text-gray-400">
          {description}
        </p>
      )}
      {action && (
        <Link
          href={action.href}
          className="mt-5 inline-flex items-center rounded-xl border border-blue-200 dark:border-blue-800 px-4 py-2 text-[14px] font-medium text-blue-500 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
