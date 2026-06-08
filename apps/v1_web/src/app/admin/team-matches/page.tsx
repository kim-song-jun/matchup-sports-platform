'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useV1MyTeamMatches } from '@/hooks/use-v1-api';
import type { V1TeamMatchApiStatus } from '@/types/api';
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

// V1MyTeamMatch.relation: 'host_team' | 'requested' | 'approved' | 'rejected' | 'withdrawn'
// V1TeamMatchApiStatus: 'recruiting' | 'matched' | 'cancelled' | 'completed' | 'expired'
type RelationFilter = 'all' | 'host_team' | 'requested';
type StatusFilter = 'all' | V1TeamMatchApiStatus;

const RELATION_LABELS: Record<RelationFilter, string> = {
  all: '전체',
  host_team: '주최',
  requested: '신청',
};

const STATUS_LABELS: Record<StatusFilter, string> = {
  all: '전체',
  recruiting: '모집중',
  matched: '매칭됨',
  completed: '완료',
  cancelled: '취소',
  expired: '만료',
};

const DISPLAY_RELATION_FILTERS: RelationFilter[] = ['all', 'host_team', 'requested'];
const DISPLAY_STATUS_FILTERS: StatusFilter[] = ['all', 'recruiting', 'matched', 'completed', 'cancelled'];

function getErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

export default function AdminTeamMatchesPage() {
  const [relationFilter, setRelationFilter] = useState<RelationFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const { data, isPending, isError, error, refetch } = useV1MyTeamMatches({ limit: 50 });

  const items = data?.items ?? [];

  const filtered = items.filter((m) => {
    const relationMatch = relationFilter === 'all' || m.relation === relationFilter;
    const statusMatch = statusFilter === 'all' || m.status === statusFilter;
    return relationMatch && statusMatch;
  });

  const stats = {
    all: items.length,
    hosted: items.filter((m) => m.relation === 'host_team').length,
    requested: items.filter((m) => m.relation !== 'host_team').length,
    recruiting: items.filter((m) => m.status === 'recruiting').length,
  };

  return (
    <AdminShell activeTab="teamMatches">
      <AdminPageHeader
        eyebrow="팀매치"
        title="내 팀매치"
        description="우리 팀이 주최하거나 신청한 팀매치를 관리하세요."
        action={
          <Link
            href="/team-matches/new"
            className="bg-blue-500 hover:bg-blue-600 text-white text-[14px] font-semibold rounded-xl px-4 h-10 inline-flex items-center transition-colors"
          >
            + 팀매치 만들기
          </Link>
        }
      />

      {/* KPI row */}
      {isPending ? (
        <AdminKpiGridSkeleton />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <AdminKpiCard label="전체" value={stats.all} />
          <AdminKpiCard label="주최" value={stats.hosted} tone="positive" />
          <AdminKpiCard label="신청" value={stats.requested} tone="warning" />
          <AdminKpiCard label="모집중" value={stats.recruiting} tone="positive" />
        </div>
      )}

      {/* Relation filter tabs */}
      <div className="flex gap-1 mb-2 overflow-x-auto pb-1">
        {DISPLAY_RELATION_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setRelationFilter(f)}
            className={`px-4 py-2 rounded-full text-[13px] font-medium whitespace-nowrap transition-colors ${
              relationFilter === f
                ? 'bg-blue-500 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
          >
            {RELATION_LABELS[f]}
          </button>
        ))}
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
        {DISPLAY_STATUS_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setStatusFilter(f)}
            className={`px-3 py-1.5 rounded-full text-[12px] font-medium whitespace-nowrap transition-colors ${
              statusFilter === f
                ? 'bg-gray-700 text-white'
                : 'bg-white border border-gray-200 text-gray-500 hover:border-gray-300'
            }`}
          >
            {STATUS_LABELS[f]}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
          <span className="text-[16px] font-bold text-gray-900">팀매치 목록</span>
          <span className="text-[13px] text-gray-400">{filtered.length}개</span>
        </div>

        {isError ? (
          <div className="px-5 py-8 text-center">
            <p className="text-[14px] text-gray-500 mb-3">
              {getErrorMessage(error, '팀매치 목록을 불러오지 못했어요.')}
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
            icon="🏆"
            title="팀매치가 없어요"
            description={
              relationFilter === 'all' && statusFilter === 'all'
                ? '팀매치를 만들거나 신청해보세요.'
                : '해당 조건의 팀매치가 없어요.'
            }
            action={
              relationFilter === 'all' && statusFilter === 'all' ? (
                <Link href="/team-matches/new" className="text-[14px] text-blue-500 font-medium hover:underline">
                  팀매치 만들기
                </Link>
              ) : undefined
            }
          />
        ) : (
          filtered.map((teamMatch) => {
            const relationLabel =
              teamMatch.relation === 'host_team'
                ? '주최'
                : teamMatch.relation === 'requested'
                ? '신청'
                : teamMatch.relation === 'approved'
                ? '승인됨'
                : teamMatch.relation === 'rejected'
                ? '거절됨'
                : teamMatch.relation === 'withdrawn'
                ? '철회됨'
                : teamMatch.relation;
            return (
              <AdminRow
                key={teamMatch.teamMatchId}
                title={teamMatch.title}
                meta={`${relationLabel}${teamMatch.teamName ? ` · ${teamMatch.teamName}` : ''} · ${formatMatchDate(teamMatch.startsAt)}`}
                badge={<AdminBadge status={teamMatch.status} />}
                href={teamMatch.manageRoute ?? teamMatch.detailRoute}
              />
            );
          })
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
