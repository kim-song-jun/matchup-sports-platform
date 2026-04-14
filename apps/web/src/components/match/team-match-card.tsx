'use client';

import React from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { sportLabel, sportCardAccent } from '@/lib/constants';
import { formatCurrency, formatMatchDate } from '@/lib/utils';
import { getGradeInfo } from '@/lib/skill-grades';
import type { TeamMatch } from '@/types/api';
import { cn } from '@/lib/utils';

const statusMap: Record<string, { label: string; className: string }> = {
  recruiting: { label: '모집중', className: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300' },
  matched: { label: '매칭완료', className: 'bg-blue-50 text-blue-500 dark:bg-blue-900/30 dark:text-blue-300' },
  completed: { label: '경기종료', className: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300' },
  cancelled: { label: '취소', className: 'bg-red-50 text-red-500 dark:bg-red-900/30 dark:text-red-400' },
};

const matchStyleLabel: Record<string, string> = {
  friendly: '친선',
  competitive: '경쟁',
  manner_focused: '매너 중시',
};

const levelLabel: Record<string, string> = {
  beginner: '입문',
  lower: '하',
  middle: '중',
  upper: '상',
  pro: '프로',
};

export interface TeamMatchCardProps {
  match: TeamMatch;
  className?: string;
}

export function TeamMatchCard({ match, className }: TeamMatchCardProps) {
  const status = statusMap[match.status] ?? statusMap.recruiting;

  return (
    <Link href={`/team-matches/${match.id}`}>
      <Card
        variant="default"
        padding="sm"
        interactive
        className={cn(
          'transition-[border-color,transform] duration-150 active:scale-[0.98]',
          className,
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2">
              <span
                className={`${sportCardAccent[match.sportType]?.badge || 'bg-gray-100 text-gray-500'} rounded-full px-2 py-0.5 text-xs font-medium`}
              >
                {sportLabel[match.sportType] ?? match.sportType}
              </span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${status.className}`}>
                {status.label}
              </span>
              {match.matchStyle && (
                <>
                  <span className="text-gray-200 dark:text-gray-600" aria-hidden="true">·</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {matchStyleLabel[match.matchStyle] ?? match.matchStyle}
                  </span>
                </>
              )}
              {match.isFreeInvitation && (
                <span className="ml-1 rounded-full bg-green-50 text-green-600 dark:bg-green-950/30 dark:text-green-300 px-2 py-0.5 text-xs font-medium">
                  무료초청
                </span>
              )}
            </div>
            <h3 className="truncate text-md font-semibold text-gray-900 dark:text-gray-100">
              {match.title}
            </h3>
          </div>
        </div>

        <p className="mt-2.5 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
          {formatMatchDate(match.matchDate)} {match.startTime}
          <span className="mx-1 text-gray-300 dark:text-gray-600" aria-hidden="true">·</span>
          {match.venueName}
        </p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {match.quarterCount}쿼터
          <span className="mx-1 text-gray-300 dark:text-gray-600" aria-hidden="true">·</span>
          {match.skillGrade
            ? getGradeInfo(match.skillGrade).label
            : match.requiredLevel
              ? (levelLabel[String(match.requiredLevel)] ?? String(match.requiredLevel))
              : '제한없음'}
          {match.gameFormat && (
            <>
              <span className="mx-1 text-gray-300 dark:text-gray-600" aria-hidden="true">·</span>
              {match.gameFormat}
            </>
          )}
          <span className="mx-1 text-gray-300 dark:text-gray-600" aria-hidden="true">·</span>
          <span className="font-semibold text-gray-800 dark:text-gray-200">
            {formatCurrency(match.opponentFee ?? match.totalFee)}
          </span>
        </p>

        <div className="mt-3 pt-2.5 border-t border-gray-50 dark:border-gray-700 flex items-center justify-between">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            신청 {String(match.applicationCount ?? 0)}팀
          </span>
          {match.hostTeam && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {match.hostTeam.name}
            </span>
          )}
        </div>
      </Card>
    </Link>
  );
}
