'use client';

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { LiveBadge } from '@/components/public-game-records/live-badge';
import { partitionLiveSchedule } from '@/components/public-game-records/schedule-grouping';
import { ScheduleRow } from '@/components/public-game-records/schedule-content';
import type { PublicScheduleEntry } from '@/components/public-game-records/types';
import { usePublicTournamentSchedule } from '@/components/public-game-records/use-public-game-records';
import { fixtureDetailHref } from '@/lib/fixture-detail-route';

/**
 * 리그 상세의 **실시간 중계** — 대회 일정(`/tournaments/:id/bracket`의 "경기 일정")과 같은 공개 일정 응답
 * (`GET /tournaments/:id/schedule`)·같은 행 컴포넌트(`ScheduleRow`)·같은 득점/카드 요약(`MatchEventSummary`)을
 * 그대로 쓴다. 서버가 리그 대진을 같은 모양의 일정 행으로 바꿔 내려주고(`toLeagueScheduleRow`), 그 행의
 * `fixtureId` 에는 팀 매치 id 가 들어 있어 리그 상세의 대진(`teamMatchId`)과 바로 맞붙는다.
 *
 * 리그 상세의 기존 일정 목록(다음 경기 강조·예정만 필터·결과 단계 칩·팀 링크)은 리그 전용 정보라 그대로 두고,
 * 이 모듈은 거기에 **진행 중인 경기 · LIVE 배너 · 경기별 진행 상태/득점 요약**만 얹는다.
 */

/** 일정이 아주 길어도 화면이 끝없이 묻지 않게 하는 상한 — 리그 한 시즌은 이 안에 들어온다. */
const MAX_AUTO_PAGES = 10;

export interface LeagueLiveSchedule {
  /** 팀 매치 id → 공개 일정 행. 일정 응답이 아직 없거나 실패하면 비어 있다. */
  readonly entryByFixtureId: ReadonlyMap<string, PublicScheduleEntry>;
  /** 지금 진행 중(`status === 'live'`)인 경기. 시작 시각 순. */
  readonly live: readonly PublicScheduleEntry[];
  /** 일정 조회가 실패했다 — 리그 대진 목록은 그대로 보이므로 화면 오류는 아니고, 실시간 정보만 빠졌다는 알림 근거다. */
  readonly isError: boolean;
  readonly retry: () => void;
}

export function useLeagueLiveSchedule(leagueId: string): LeagueLiveSchedule {
  // 리그 상세는 몇 주 뒤 경기까지 담고 있다 — 진행 중이거나 곧 시작하는 경기가 있을 때만 폴링한다.
  const query = usePublicTournamentSchedule(leagueId, {}, { imminentOnlyPolling: true });
  const { hasNextPage, isFetchingNextPage, fetchNextPage, refetch } = query;
  const pages = query.data?.pages;
  const pageCount = pages?.length ?? 0;

  // 한 페이지에 다 안 담기면 나머지를 이어서 받는다 — 진행 중인 경기가 뒤 페이지에 있으면 놓치기 때문이다.
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && pageCount < MAX_AUTO_PAGES) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, pageCount, fetchNextPage]);

  return useMemo(() => {
    const items = (pages ?? []).flatMap((page) => page.items);
    // `unscheduled`(시간 미정)는 첫 페이지에 전부 실려 오고 페이지마다 같다 — 한 번만 읽는다.
    const unscheduled = pages?.[0]?.unscheduled ?? [];
    const entryByFixtureId = new Map<string, PublicScheduleEntry>();
    for (const entry of [...items, ...unscheduled]) entryByFixtureId.set(entry.fixtureId, entry);
    return {
      entryByFixtureId,
      live: partitionLiveSchedule(items, unscheduled).live,
      isError: query.isError,
      retry: () => void refetch(),
    };
  }, [pages, query.isError, refetch]);
}

/**
 * 리그 상세 위쪽 LIVE 배너 — 진행 중인 경기가 있을 때만 뜬다. 누르면 그 경기 상세(실시간 점수·기록)로 간다.
 * 색만으로 전달하지 않는다: `LiveBadge` 가 "LIVE" 글자와 진행 시계를 함께 싣는다.
 */
export function LeagueLiveBanner({
  leagueId,
  live,
  fromHref,
}: {
  leagueId: string;
  live: readonly PublicScheduleEntry[];
  fromHref?: string | null;
}) {
  if (live.length === 0) return null;
  const first = live[0];
  const href = fixtureDetailHref({ isRegularLeague: true, competitionId: leagueId, fixtureId: first.fixtureId, fromHref });
  return (
    <Link
      href={href}
      className="tm-pressable mt-3 flex min-h-[44px] items-center justify-between gap-3 rounded-xl border border-[var(--blue500)] bg-[var(--blue50)] px-3 py-2 text-[length:var(--font-size-body-sm)]"
    >
      <span className="flex min-w-0 flex-wrap items-center gap-2">
        <LiveBadge clock={first.clock} periodBreak={first.periodBreak} periodCount={first.periodCount} />
        <span className="font-semibold text-[var(--text-strong)]">
          {live.length === 1 ? '지금 한 경기가 진행 중이에요' : `지금 ${live.length}경기가 진행 중이에요`}
        </span>
      </span>
      <span className="shrink-0 font-semibold text-[var(--blue700)]">
        {live.length === 1 ? '라이브 보기' : '첫 경기 보기'} →
      </span>
    </Link>
  );
}

/** 경기 일정 맨 위 "진행 중인 경기" — 대회 일정과 같은 카드(점수·진행 시계·득점 기록)를 그대로 그린다. */
export function LeagueLiveSection({
  leagueId,
  live,
  fromHref,
}: {
  leagueId: string;
  live: readonly PublicScheduleEntry[];
  fromHref?: string | null;
}) {
  if (live.length === 0) return null;
  return (
    <section aria-label="진행 중인 경기" className="mb-4">
      <h3 className="tm-hub-section-title" style={{ marginBottom: 12 }}>진행 중인 경기</h3>
      <div className="tm-schedule-list">
        {live.map((entry) => (
          <ScheduleRow
            key={entry.fixtureId}
            tournamentId={leagueId}
            entry={entry}
            isMine={false}
            isRegularLeague
            fromHref={fromHref}
          />
        ))}
      </div>
    </section>
  );
}
