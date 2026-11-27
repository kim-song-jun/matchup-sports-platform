'use client';

import { useEffect, useMemo } from 'react';
import type { AdminToastVariant } from '@/components/admin';
import { stageBracketView } from '@/lib/stage-bracket-view';
import type { StagePool } from '@/types/stage-plan';
import { AdminListSkeleton } from '@/components/admin/admin-skeleton';
import { EmptyState, ErrorState } from '@/components/v1-ui/primitives';
import { useV1AdminBracket } from '@/hooks/use-v1-api';
import { buildLeagueStandings } from '@/lib/bracket-league-standings-model';
import { buildBracketMobileRounds, buildLeagueTournamentMobileRounds, candidatesFromRegistrations, type MobileRound } from '@/lib/bracket-canvas-mobile-model';
import { extractErrorMessage } from '@/lib/error-message';
import type { V1AdminTournamentRegistration, V1TournamentFormat, V1SixTeamBracket } from '@/types/api';
import { BracketCanvasMobile } from './bracket-canvas-mobile';
import { BracketLeagueStandings } from './bracket-league-standings';
import { MobileTeamFillSheet } from './mobile-team-fill-sheet';
import type { RegistrationsLoadState } from './bracket-team-tray';
import type { BracketViewControls } from './use-bracket-view-controls';

export interface BracketCanvasMobileScreenProps {
  pool?: StagePool;
  sixTeamState?: V1SixTeamBracket | null;
  tournamentId: string;
  registrations: V1AdminTournamentRegistration[];
  registrationsState: RegistrationsLoadState;
  canWrite: boolean;
  format?: V1TournamentFormat;
  showToast: (message: string, variant?: AdminToastVariant) => void;
  controls: BracketViewControls;
}

/** 시간이 없는 경기만 남긴다. 부전승 칸은 시간 개념이 없어 같이 거르고, 비는 구역·라운드는 지운다. */
function unscheduledOnly(rounds: MobileRound[]): MobileRound[] {
  return rounds
    .map((round) => ({
      ...round,
      sections: round.sections
        .map((section) => ({ ...section, nodes: section.nodes.filter((node) => node.byeSlotId === undefined && node.scheduledAt === null) }))
        .filter((section) => section.nodes.length > 0),
    }))
    .filter((round) => round.sections.length > 0);
}

/** 768px 미만의 대진 화면. 도구 메뉴·공개 막대는 위의 도구 줄이 그리고, 여기서는 경기 카드와 시트만 보여 준다. */
export function BracketCanvasMobileScreen({ pool, sixTeamState, tournamentId, registrations, registrationsState, canWrite, format, showToast, controls }: BracketCanvasMobileScreenProps) {
  const { data: fullBracket, isPending, isError, error, refetch } = useV1AdminBracket(tournamentId);
  const bracket = useMemo(() => fullBracket && stageBracketView(fullBracket, pool), [fullBracket, pool]);
  const league = pool ? pool.format === 'league' : format === 'league';
  const allRounds = useMemo(() => {
    if (bracket === undefined) return [];
    const input = { groups: bracket.groups, fixtures: bracket.fixtures, slots: bracket.slots };
    return league ? buildLeagueTournamentMobileRounds(input) : buildBracketMobileRounds(input);
  }, [bracket, league]);
  const rounds = useMemo(() => (controls.unscheduledOnly ? unscheduledOnly(allRounds) : allRounds), [allRounds, controls.unscheduledOnly]);
  const standingsGroups = useMemo(
    () => (bracket === undefined ? [] : buildLeagueStandings({ groups: bracket.groups, standings: bracket.standings })),
    [bracket],
  );
  const candidates = useMemo(() => candidatesFromRegistrations(registrations), [registrations]);
  // 도구 메뉴가 요청한 경기를 시트로 연다 — 열린 뒤에는 요청을 비워 다음 요청이 같은 경기여도 다시 열리게 한다.
  const focusRequest = controls.focusRequest;
  const focusFixtureId = focusRequest !== null && bracket?.fixtures.some((fixture) => fixture.id === focusRequest.fixtureId) ? focusRequest.fixtureId : null;
  const { clearFocusRequest } = controls;
  useEffect(() => { if (focusFixtureId !== null) clearFocusRequest(); }, [focusFixtureId, clearFocusRequest]);

  // 대회 형식이 정해지기 전에 그리면 리그 대회가 토너먼트 라운드로 잠깐 보였다가 바뀐다.
  if (isPending || format === undefined) {
    return (
      <div role="status" aria-busy="true" aria-label="대진을 불러오는 중이에요">
        <AdminListSkeleton rows={4} />
      </div>
    );
  }
  if (isError || bracket === undefined) {
    return (
      <ErrorState
        title="대진을 불러오지 못했어요"
        message={extractErrorMessage(error, '잠시 뒤 다시 시도해 주세요.')}
        onRetry={() => void refetch()}
      />
    );
  }

  return (
    <>
      {league && standingsGroups.length > 0 ? (
        <details className="mb-3" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-container)', background: 'var(--card-surface)' }}>
          <summary className="tm-text-label flex min-h-[44px] cursor-pointer items-center px-4 font-semibold">조별 순위</summary>
          <div className="px-3 pb-3">
            <BracketLeagueStandings groups={standingsGroups} />
          </div>
        </details>
      ) : null}
      {controls.unscheduledOnly && rounds.length === 0 ? (
        <EmptyState title="시간 미정 경기가 없어요" sub="모든 경기에 시간이 있어요." cta="모든 경기 보기" onCta={() => controls.setUnscheduledOnly(false)} />
      ) : (
        <BracketCanvasMobile
          hint={null}
          focusFixtureId={focusFixtureId}
          sixTeamState={sixTeamState}
          registrations={registrations}
          competitionId={tournamentId}
          scope="tournament"
          rounds={rounds}
          slots={bracket.slots}
          groups={bracket.groups}
          fixtures={bracket.fixtures}
          candidates={candidates}
          canWrite={canWrite}
          registrationsState={registrationsState}
          showToast={showToast}
        />
      )}
      <MobileTeamFillSheet
        open={controls.trayOpen === true}
        onClose={() => controls.setTrayOpen(false)}
        tournamentId={tournamentId}
        bracket={bracket}
        registrations={registrations}
        registrationsState={registrationsState}
        showToast={showToast}
      />
    </>
  );
}
