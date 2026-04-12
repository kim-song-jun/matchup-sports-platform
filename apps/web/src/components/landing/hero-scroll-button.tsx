'use client';

import { ChevronDown } from 'lucide-react';

interface HeroScrollButtonProps {
  targetId: string;
}

export function HeroScrollButton({ targetId }: HeroScrollButtonProps) {
  const handleClick = () => {
    const target = document.getElementById(targetId);
    target?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <button
      onClick={handleClick}
      className="inline-flex items-center justify-center gap-2 text-gray-500 dark:text-gray-400 rounded-xl px-6 py-3.5 text-md font-semibold hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800 active:scale-[0.97] transition-[colors,transform] duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
    >
      더 알아보기
      <ChevronDown size={18} />
    </button>
  );
}
