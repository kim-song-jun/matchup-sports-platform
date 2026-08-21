'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useV1LeagueMatches, useV1MasterSports } from '@/hooks/use-v1-api';
import { EmptyState, ErrorState } from '@/components/v1-ui/primitives';
import { getSportAccent } from '@/lib/v1-sport-accent';
import { formatTournamentDateRangeShort } from '@/lib/date-utils';
import { extractErrorMessage } from '@/lib/error-message';
import type { V1PublicLeagueListItem } from '@/types/league-match';

type LeagueState = 'draft' | 'active' | 'completed';

/**
 * league-match-standings-client.tsx(Wave 1, R1/R7)의 LEAGUE_STATE_META와 라벨·배지
 * 클래스가 동일해야 한다(R5 요구사항). 두 파일이 서로 다른 병렬 작업 트랙(Task 152
 * R1/R7 vs R5)에서 동시에 편집되고 있어 import로 묶지 않고 값만 그대로 맞춘다 --
 * 상태 라벨을 바꿀 일이 생기면 두 파일 모두 갱신해야 한다.
 */
const LEAGUE_STATE_META: Record<LeagueState, { label: string; badgeClass: string }> = {
  draft: { label: '준비 중', badgeClass: 'tm-badge-grey' },
  active: { label: '진행 중', badgeClass: 'tm-badge-blue' },
  completed: { label: '종료', badgeClass: 'tm-badge-green' },
};

const LEAGUE_STATE_FILTERS: Array<{ value: LeagueState | null; label: string }> = [
  { value: null, label: '전체' },
  { value: 'active', label: '진행 중' },
  { value: 'draft', label: '준비 중' },
  { value: 'completed', label: '종료' },
];

const LEAGUE_LIST_ERROR_FALLBACK = '리그 목록을 불러오지 못했어요.';
const LEAGUE_LIST_PAGE_SIZE = 20;

function parseLeagueState(value: string | null): LeagueState | undefined {
  return value === 'active' || value === 'draft' || value === 'completed' ? value : undefined;
}

export default function LeagueMatchesListClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sportId = searchParams.get('sportId') ?? undefined;
  const state = parseLeagueState(searchParams.get('state'));

  // 데스크톱 페이지 번호 대신 "더 보기" 누적 방식만 쓴다 -- 대회 목록(tournaments/page.tsx)의
  // 폭 분기(데스크톱=페이지 번호, 모바일=무한 스크롤)는 대회 목록이 훨씬 커질 수 있어 생긴
  // 요구였고, 리그 목록은 아직 그 정도 규모 근거가 없어 더 단순한 단일 경로로 시작한다.
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [accumulated, setAccumulated] = useState<V1PublicLeagueListItem[]>([]);

  const { data: sportsData } = useV1MasterSports();
  const filterSports = (sportsData ?? []).filter((sport) => sport.id).map((sport) => ({ id: sport.id, label: sport.name }));

  const leaguesQuery = useV1LeagueMatches({ sportId, state, cursor, limit: LEAGUE_LIST_PAGE_SIZE });
  const pageItems = leaguesQuery.data?.items ?? [];
  const items: V1PublicLeagueListItem[] = cursor
    ? [...accumulated, ...pageItems.filter((item) => !accumulated.some((prev) => prev.leagueId === item.leagueId))]
    : pageItems;
  const hasNext = leaguesQuery.data?.pageInfo.hasNext ?? false;

  function updateFilter(next: { sportId?: string | null; state?: LeagueState | null }) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.sportId !== undefined) {
      if (next.sportId === null) params.delete('sportId');
      else params.set('sportId', next.sportId);
    }
    if (next.state !== undefined) {
      if (next.state === null) params.delete('state');
      else params.set('state', next.state);
    }
    setCursor(undefined);
    setAccumulated([]);
    router.replace(`/league-matches${params.toString() ? `?${params.toString()}` : ''}`, { scroll: false });
  }

  function handleLoadMore() {
    if (!leaguesQuery.data?.pageInfo.nextCursor || leaguesQuery.isFetching) return;
    setAccumulated(items);
    setCursor(leaguesQuery.data.pageInfo.nextCursor);
  }

  const activeSportLabel = sportId ? filterSports.find((sport) => sport.id === sportId)?.label : null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="text-xl font-bold text-[var(--text-strong)]">리그전 찾기</h1>
      <p className="mt-1 text-sm text-[var(--text-muted)]">종목과 상태로 좁혀 관심 있는 리그를 찾아보세요.</p>

      <div role="group" aria-label="종목 필터" className="tm-sport-chip-row mt-4">
        <button
          type="button"
          onClick={() => updateFilter({ sportId: null })}
          aria-pressed={!sportId}
          aria-label="전체 종목"
          className={`tm-chip${!sportId ? ' tm-chip-active' : ''}`}
        >
          전체
        </button>
        {filterSports.map(({ id, label }) => {
          const isActive = sportId === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => updateFilter({ sportId: id })}
              aria-pressed={isActive}
              aria-label={`${label} 종목만 보기`}
              className={`tm-chip${isActive ? ' tm-chip-active' : ''}`}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div role="group" aria-label="상태 필터" className="tm-sport-chip-row mt-2">
        {LEAGUE_STATE_FILTERS.map((filter) => {
          const isActive = filter.value === (state ?? null);
          return (
            <button
              key={filter.label}
              type="button"
              onClick={() => updateFilter({ state: filter.value })}
              aria-pressed={isActive}
              aria-label={`${filter.label} 리그만 보기`}
              className={`tm-chip${isActive ? ' tm-chip-active' : ''}`}
            >
              {filter.label}
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        {leaguesQuery.isLoading ? (
          <LeagueListSkeleton />
        ) : leaguesQuery.isError ? (
          <ErrorState
            message={extractErrorMessage(leaguesQuery.error, LEAGUE_LIST_ERROR_FALLBACK)}
            onRetry={() => void leaguesQuery.refetch()}
          />
        ) : items.length === 0 ? (
          <EmptyState
            title={activeSportLabel ? `${activeSportLabel} 리그가 없어요` : '조건에 맞는 리그가 없어요'}
            sub="다른 종목이나 상태를 선택해 보세요."
          />
        ) : (
          <>
            <ul className="space-y-2" role="list" aria-label="리그 목록">
              {items.map((item) => {
                const stateMeta = LEAGUE_STATE_META[item.state];
                const accent = getSportAccent(item.sport.code);
                return (
                  <li key={item.leagueId}>
                    <Link
                      href={`/league-matches/${item.leagueId}`}
                      className="tm-pressable tm-list-row-interactive flex min-h-[44px] flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--card-surface)] p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                      aria-label={`${item.title} 상세로 이동`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-[var(--text-strong)]">{item.title}</span>
                          {/* 티어 뱃지 — 리그 체계에 속한 리그에만 붙인다. 단발 리그는
                              tierLabel 이 null 이라(티어가 "1부"인 게 아니라 개념 자체가 없다)
                              아무것도 표시하지 않는다. 팀이 자기 수준의 리그를 고르는 지점이
                              바로 이 목록이라 상세뿐 아니라 여기에도 있어야 한다. */}
                          {item.tierLabel !== null && (
                            <span className="tm-badge tm-badge-sm tm-badge-blue">{item.tierLabel}</span>
                          )}
                          <span className={`tm-badge tm-badge-sm ${stateMeta.badgeClass}`}>{stateMeta.label}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--text-muted)] sm:text-sm">
                          <span className="inline-flex items-center gap-1.5">
                            <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: accent.dot }} />
                            {accent.label}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{item.region.name}</span>
                          <span aria-hidden="true">·</span>
                          <span>{formatTournamentDateRangeShort(item.startsOn, item.endsOn) ?? '일정 미정'}</span>
                        </div>
                      </div>
                      <div className="flex-shrink-0 text-xs text-[var(--text-muted)] sm:text-sm">{item.teamCount}팀 참가</div>
                    </Link>
                  </li>
                );
              })}
            </ul>

            {hasNext ? (
              <button
                type="button"
                className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block"
                style={{ marginTop: 16 }}
                disabled={leaguesQuery.isFetching}
                onClick={handleLoadMore}
              >
                {leaguesQuery.isFetching ? '불러오는 중…' : '더 보기'}
              </button>
            ) : null}
            <p aria-live="polite" className="sr-only">
              {leaguesQuery.isFetching
                ? '리그를 더 불러오는 중이에요.'
                : `리그 ${items.length}개를 보고 있어요.${hasNext ? '' : ' 마지막 목록이에요.'}`}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function LeagueListSkeleton() {
  return (
    <div aria-busy="true" aria-label="리그 목록 불러오는 중" className="space-y-2">
      <div className="tm-skeleton" style={{ height: 76, borderRadius: 12, opacity: 1 }} />
      <div className="tm-skeleton" style={{ height: 76, borderRadius: 12, opacity: 0.65 }} />
      <div className="tm-skeleton" style={{ height: 76, borderRadius: 12, opacity: 0.35 }} />
    </div>
  );
}
