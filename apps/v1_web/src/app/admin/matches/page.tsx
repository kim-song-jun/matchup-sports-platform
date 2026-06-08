'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useV1MyMatches } from '@/hooks/use-v1-api';
import type { V1Status } from '@/types/api';
import {
  AdminShell,
  AdminPageHeader,
  AdminKpiCard,
  AdminBadge,
  AdminRow,
  AdminEmpty,
  AdminListSkeleton,
  AdminKpiGridSkeleton,
} from '@/components/admin';

// V1Status: 'open' | 'pending' | 'confirmed' | 'closed' | 'cancelled'
type StatusFilter = 'all' | 'open' | 'confirmed' | 'closed' | 'cancelled';

const FILTER_LABELS: Record<StatusFilter, string> = {
  all: '전체',
  open: '모집중',
  confirmed: '진행중',
  closed: '종료',
  cancelled: '취소',
};

const DISPLAY_FILTERS: StatusFilter[] = ['all', 'open', 'confirmed', 'closed', 'cancelled'];

function getErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

export default function AdminMatchesPage() {
  const [filter, setFilter] = useState<StatusFilter>('all');
  const { data, isPending, isError, error, refetch } = useV1MyMatches({ limit: 50 });

  const items = data?.items ?? [];

  const isActiveStatus = (s: V1Status) => s === 'confirmed' || s === 'pending';
  const isDoneStatus = (s: V1Status) => s === 'closed' || s === 'cancelled';

  const filtered =
    filter === 'all' ? items : items.filter((m) => m.status === filter);

  const stats = {
    all: items.length,
    open: items.filter((m) => m.status === 'open').length,
    active: items.filter((m) => isActiveStatus(m.status)).length,
    done: items.filter((m) => isDoneStatus(m.status)).length,
  };

  return (
    <AdminShell activeTab="matches">
      <AdminPageHeader
        eyebrow="매치 관리"
        title="내 매치"
        description="내가 만든 매치를 관리하세요."
        action={
          <Link
            href="/matches/new"
            className="bg-blue-500 hover:bg-blue-600 text-white text-[14px] font-semibold rounded-xl px-4 h-10 inline-flex items-center transition-colors"
          >
            + 매치 만들기
          </Link>
        }
      />

      {/* KPI row */}
      {isPending ? (
        <AdminKpiGridSkeleton />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <AdminKpiCard label="전체" value={stats.all} />
          <AdminKpiCard label="모집중" value={stats.open} tone="positive" />
          <AdminKpiCard label="진행중" value={stats.active} tone="warning" />
          <AdminKpiCard label="종료/완료" value={stats.done} />
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
        {DISPLAY_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-full text-[13px] font-medium whitespace-nowrap transition-colors ${
              filter === f
                ? 'bg-blue-500 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
          >
            {FILTER_LABELS[f]}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
          <span className="text-[16px] font-bold text-gray-900">매치 목록</span>
          <span className="text-[13px] text-gray-400">{filtered.length}개</span>
        </div>

        {isError ? (
          <div className="px-5 py-8 text-center">
            <p className="text-[14px] text-gray-500 mb-3">
              {getErrorMessage(error, '매치 목록을 불러오지 못했어요.')}
            </p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="text-[14px] text-blue-500 font-medium hover:underline"
            >
              다시 시도
            </button>
          </div>
        ) : isPending ? (
          <AdminListSkeleton rows={5} />
        ) : filtered.length === 0 ? (
          <AdminEmpty
            icon="⚽"
            title="매치가 없어요"
            description={filter === 'all' ? '첫 번째 매치를 만들어보세요.' : '해당 상태의 매치가 없어요.'}
            action={
              filter === 'all' ? (
                <Link href="/matches/new" className="text-[14px] text-blue-500 font-medium hover:underline">
                  매치 만들기
                </Link>
              ) : undefined
            }
          />
        ) : (
          filtered.map((match) => (
            <AdminRow
              key={match.id}
              title={match.title}
              meta={`${match.participantCount ?? 0}/${match.capacity ?? '?'}명 · ${formatMatchDate(match.startsAt)}`}
              badge={<AdminBadge status={match.status} />}
              href={`/matches/${match.id}`}
            />
          ))
        )}
      </div>
    </AdminShell>
  );
}

function formatMatchDate(dateStr?: string): string {
  if (!dateStr) return '날짜 미정';
  try {
    return new Intl.DateTimeFormat('ko-KR', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
}
