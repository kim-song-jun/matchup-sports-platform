'use client';

import Link from 'next/link';

interface SportCardProps {
  type: string;
  label: string;
  emoji: string;
  color: string;
}

export function SportCard({ type, label, emoji, color }: SportCardProps) {
  return (
    <Link
      href={`/matches?sport=${type}`}
      className="flex flex-col items-center gap-1.5 rounded-2xl border border-border bg-white p-4 transition-all hover:shadow-md active:scale-95"
    >
      <span className="text-2xl">{emoji}</span>
      <span className="text-xs font-semibold" style={{ color }}>
        {label}
      </span>
    </Link>
  );
}
