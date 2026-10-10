'use client';

import { useMemo } from 'react';
import type { AdminToastVariant } from '@/components/admin';
import { AdminListSkeleton } from '@/components/admin/admin-skeleton';
import { ErrorState } from '@/components/v1-ui/primitives';
import { useV1AdminBracket } from '@/hooks/use-v1-api';
import { buildLeagueStandings } from '@/lib/bracket-league-standings-model';
import { buildBracketMobileRounds, buildLeagueTournamentMobileRounds, candidatesFromRegistrations } from '@/lib/bracket-canvas-mobile-model';
import { extractErrorMessage } from '@/lib/error-message';
import type { V1AdminTournamentRegistration, V1TournamentFormat } from '@/types/api';
import { BracketCanvasMobile } from './bracket-canvas-mobile';
import { BracketLeagueStandings } from './bracket-league-standings';
import type { RegistrationsLoadState } from './bracket-team-tray';

export interface BracketCanvasMobileScreenProps {
  tournamentId: string;
  registrations: V1AdminTournamentRegistration[];
  registrationsState: RegistrationsLoadState;
  canWrite: boolean;
  format?: V1TournamentFormat;
  showToast: (message: string, variant?: AdminToastVariant) => void;
}

/** 768px 미만의 대진 그림 화면. 구조 편집 도구(툴바·트레이)는 두지 않고 목록과 시트만 보여 준다. */
export function BracketCanvasMobileScreen({ tournamentId, registrations, registrationsState, canWrite, format, showToast }: BracketCanvasMobileScreenProps) {
  const { data: bracket, isPending, isError, error, refetch } = useV1AdminBracket(tournamentId);
  const rounds = useMemo(() => {
    if (bracket === undefined) return [];
    const input = { groups: bracket.groups, fixtures: bracket.fixtures, slots: bracket.slots };
    return format === 'league' ? buildLeagueTournamentMobileRounds(input) : buildBracketMobileRounds(input);
  }, [bracket, format]);
  const standingsGroups = useMemo(
    () => (bracket === undefined ? [] : buildLeagueStandings({ groups: bracket.groups, standings: bracket.standings })),
    [bracket],
  );
  const candidates = useMemo(() => candidatesFromRegistrations(registrations), [registrations]);

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
      {format === 'league' && standingsGroups.length > 0 ? (
        <details className="mb-3" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-container)', background: 'var(--card-surface)' }}>
          <summary className="tm-text-label flex min-h-[44px] cursor-pointer items-center px-4 font-semibold">조별 순위</summary>
          <div className="px-3 pb-3">
            <BracketLeagueStandings groups={standingsGroups} />
          </div>
        </details>
      ) : null}
      <BracketCanvasMobile
        competitionId={tournamentId}
        scope="tournament"
        rounds={rounds}
        slots={bracket.slots}
        groups={bracket.groups}
        candidates={candidates}
        canWrite={canWrite}
        registrationsState={registrationsState}
        showToast={showToast}
      />
    </>
  );
}
