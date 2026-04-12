import React from 'react';
import Link from 'next/link';
import { ChevronRight, Star, Users } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { sportCardAccent, sportLabel, levelLabel } from '@/lib/constants';
import { formatCurrency, formatMatchDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { MercenaryPost } from '@/types/api';

const positionLabel: Record<string, string> = {
  GK: '골키퍼',
  DF: '수비수',
  MF: '미드필더',
  FW: '공격수',
  ALL: '포지션 무관',
};

const statusLabel: Record<string, string> = {
  open: '모집중',
  filled: '정원 마감',
  closed: '모집 종료',
  cancelled: '취소됨',
};

const statusStyle: Record<string, string> = {
  open: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300',
  filled: 'bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300',
  closed: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
  cancelled: 'bg-red-50 text-red-500 dark:bg-red-950/30 dark:text-red-300',
};

export interface MercenaryCardProps {
  post: MercenaryPost;
  className?: string;
}

export function MercenaryCard({ post, className }: MercenaryCardProps) {
  const teamName = post.team?.name ?? '—';
  const mannerScore = post.team?.mannerScore ?? 0;
  const positionKey = post.position ?? 'ALL';
  const fee = post.fee ?? 0;
  const level = post.level ?? 0;
  const count = post.count ?? 1;

  return (
    <Link href={`/mercenary/${post.id}`} className="block">
      <Card
        variant="default"
        padding="sm"
        interactive
        className={cn('active:scale-[0.98] transition-[border-color,transform] duration-150', className)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 mb-1 text-xs text-gray-500 flex-wrap">
              <span className={`rounded-md px-1.5 py-0.5 font-semibold ${sportCardAccent[post.sportType]?.badge ?? 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300'}`}>
                {sportLabel[post.sportType] ?? post.sportType}
              </span>
              <span className={`rounded-md px-1.5 py-0.5 font-semibold ${statusStyle[post.status] ?? statusStyle.closed}`}>
                {statusLabel[post.status] ?? post.status}
              </span>
              <span>{positionLabel[positionKey] ?? positionKey}</span>
            </div>
            <h2 className="text-md font-semibold text-gray-900 dark:text-gray-100 truncate">
              {teamName}
            </h2>
          </div>
          <div className="flex items-center gap-1 text-xs text-amber-500 shrink-0">
            <Star size={12} fill="currentColor" aria-hidden="true" />
            <span className="font-semibold">{mannerScore.toFixed(1)}</span>
          </div>
        </div>

        <p className="mt-2.5 text-sm text-gray-500 leading-relaxed">
          {formatMatchDate(post.matchDate)}
          {post.venue && (
            <>
              <span className="text-gray-300 dark:text-gray-600 mx-1" aria-hidden="true">·</span>
              {post.venue}
            </>
          )}
        </p>
        <p className="mt-1 text-sm text-gray-500">
          {levelLabel[level] ?? `레벨 ${level}`} 이상
          <span className="text-gray-300 dark:text-gray-600 mx-1" aria-hidden="true">·</span>
          <span className={`font-semibold ${fee === 0 ? 'text-green-600 dark:text-green-400' : 'text-gray-800 dark:text-gray-200'}`}>
            {formatCurrency(fee)}
          </span>
        </p>

        {post.notes && (
          <p className="mt-2 text-xs text-gray-500 truncate">{post.notes}</p>
        )}

        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-gray-500 flex items-center gap-1">
            <Users size={12} aria-hidden="true" />
            모집 {count}명 / 신청 {post.applicationCount ?? 0}명
          </span>
          <span className="inline-flex items-center gap-1 rounded-xl bg-gray-100 dark:bg-gray-700 px-3 py-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
            상세 보기
            <ChevronRight size={14} aria-hidden="true" />
          </span>
        </div>
      </Card>
    </Link>
  );
}
