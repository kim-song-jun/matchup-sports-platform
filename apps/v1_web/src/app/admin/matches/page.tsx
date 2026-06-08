'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Swords, Plus, Inbox, Filter } from 'lucide-react';
import { useV1MyMatches } from '@/hooks/use-v1-api';
import type { V1MatchApiStatus } from '@/types/api';
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

function getErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

function formatDate(dateStr?: string) {
  if (!dateStr) return '날짜 미정';
  try {
    return new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(dateStr));
  } catch { return dateStr; }
}

type FilterKey = 'all' | 'open' | 'active' | 'done';

const OPEN_STATUSES: V1MatchApiStatus[] = ['open', 'recruiting'];
const ACTIVE_STATUSES: V1MatchApiStatus[] = ['confirmed', 'pending'];
const DONE_STATUSES: V1MatchApiStatus[] = ['closed', 'cancelled', 'completed', 'expired', 'full'];

const FILTER_LABELS: Record<FilterKey, string> = {
  all: '전체', open: '모집중', active: '진행중', done: '종료',
};

export default function AdminMatchesPage() {
  const [filter, setFilter] = useState<FilterKey>('all');
  const { data, isPending, isError, error, refetch } = useV1MyMatches({ limit: 50 });

  const items = data?.items ?? [];

  const filtered = filter === 'all' ? items
    : filter === 'open' ? items.filter((m) => OPEN_STATUSES.includes(m.status))
    : filter === 'active' ? items.filter((m) => ACTIVE_STATUSES.includes(m.status))
    : items.filter((m) => DONE_STATUSES.includes(m.status));

  const stats = {
    all: items.length,
    open: items.filter((m) => OPEN_STATUSES.includes(m.status)).length,
    active: items.filter((m) => ACTIVE_STATUSES.includes(m.status)).length,
    done: items.filter((m) => DONE_STATUSES.includes(m.status)).length,
  };

  return (
    <AdminShell>
      <AdminPageHeader
        eyebrow="매치 관리"
        title="내 매치"
        description="내가 만든 매치를 관리하세요."
        action={
          <Link href="/matches/new" className="bg-blue-500 hover:bg-blue-600 text-white text-[14px] font-semibold rounded-xl px-4 h-10 inline-flex items-center gap-2 transition-colors">
            <Plus size={15} />매치 만들기
          </Link>
        }
      />

      {isPending ? <AdminKpiGridSkeleton /> : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <AdminKpiCard label="전체" value={stats.all} />
          <AdminKpiCard label="모집중" value={stats.open} tone="positive" />
          <AdminKpiCard label="진행중" value={stats.active} tone="warning" />
          <AdminKpiCard label="종료" value={stats.done} />
        </div>
      )}

      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {(Object.entries(FILTER_LABELS) as [FilterKey, string][]).map(([key, label]) => (
          <button key={key} type="button" onClick={() => setFilter(key)}
            className={`px-4 py-2 rounded-full text-[13px] font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
              filter === key ? 'bg-blue-500 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
            }`}>
            {label}
            {key !== 'all' && stats[key] > 0 && (
              <span className={`ml-1.5 text-[11px] font-bold ${filter === key ? 'text-blue-100' : 'text-gray-400'}`}>{stats[key]}</span>
            )}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
          <div className="flex items-center gap-2">
            <Swords size={16} className="text-gray-400" />
            <span className="text-[15px] font-bold text-gray-900">매치 목록</span>
          </div>
          <span className="text-[13px] text-gray-400">{filtered.length}개</span>
        </div>
        {isError ? (
          <div className="px-5 py-10 text-center">
            <p className="text-[14px] text-gray-500 mb-3">{getErrorMessage(error, '매치 목록을 불러오지 못했어요.')}</p>
            <button type="button" onClick={() => void refetch()} className="text-[14px] text-blue-500 font-medium">다시 시도</button>
          </div>
        ) : isPending ? <AdminListSkeleton rows={5} />
        : filtered.length === 0 ? (
          filter === 'all'
            ? <AdminEmpty icon={<Inbox size={36} />} title="만든 매치가 없어요" description="첫 번째 매치를 만들어보세요."
                action={<Link href="/matches/new" className="text-[14px] text-blue-500 font-medium">매치 만들기</Link>} />
            : <AdminEmpty icon={<Filter size={36} />} title="해당하는 매치가 없어요" description={`${FILTER_LABELS[filter]} 상태의 매치가 없어요.`} />
        ) : (
          filtered.map((m) => {
            const id = (m as unknown as { id?: string; matchId?: string }).id ?? (m as unknown as { matchId?: string }).matchId;
            return (
              <AdminRow key={id} title={m.title}
                meta={`${formatDate(m.startsAt)} · ${m.participantCount ?? 0}/${m.capacity ?? '?'}명`}
                badge={<AdminBadge status={m.status} />} href={`/matches/${id}`} />
            );
          })
        )}
      </div>
    </AdminShell>
  );
}
