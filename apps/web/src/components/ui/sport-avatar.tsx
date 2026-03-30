'use client';

import { SportIconMap } from '@/components/icons/sport-icons';

interface SportAvatarProps {
  name: string;
  sportType?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const gradients = [
  'from-blue-400 to-blue-600',
  'from-blue-500 to-indigo-600',
  'from-sky-400 to-blue-600',
  'from-blue-400 to-cyan-500',
  'from-indigo-400 to-blue-600',
  'from-blue-500 to-blue-700',
] as const;

const sizeStyles = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-base',
  lg: 'h-14 w-14 text-xl',
} as const;

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function SportAvatar({ name, sportType, size = 'md', className = '' }: SportAvatarProps) {
  const gradientIndex = hashName(name) % gradients.length;
  const gradient = gradients[gradientIndex];
  const initial = name.charAt(0).toUpperCase();
  const SportIcon = sportType ? SportIconMap[sportType] : null;

  return (
    <div className={`relative inline-flex shrink-0 ${className}`}>
      <div
        className={`${sizeStyles[size]} bg-gradient-to-br ${gradient} rounded-full flex items-center justify-center`}
      >
        <span className="font-bold text-white leading-none">{initial}</span>
      </div>
      {SportIcon && (
        <div className="absolute -bottom-0.5 -right-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-white dark:bg-gray-800 shadow-sm ring-1 ring-gray-100 dark:ring-gray-700">
          <SportIcon size={12} className="text-gray-600 dark:text-gray-300" />
        </div>
      )}
    </div>
  );
}
