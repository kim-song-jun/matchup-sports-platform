'use client';

import { AdminPageSkeleton } from '@/components/admin';
import { ErrorState } from '@/components/v1-ui/primitives';
import { useLeagueSettings } from '@/hooks/use-league-settings';
import { useTournamentPeriodSettings } from '@/hooks/use-tournament-period-settings';
import { extractErrorMessage } from '@/lib/error-message';
import type { V1AdminLeagueDetail } from '@/types/league-match';
import type { LeagueSettings } from '@/types/league-settings';
import { LeagueCreateWizard, type LeagueCreatePrefill } from '../../league-create-wizard';

/** 리그 개설 화면의 경기 시간 칸은 전·후반(2) 또는 단판(1)만 받는다 — 그 밖이면 종목 기본값으로 시작한다. */
const COPYABLE_PERIOD_COUNTS = new Set([1, 2]);

/** 지난 리그 설정 → 다음 시즌 개설 화면 초기값. 기간·신청 마감·참가팀은 옮기지 않는다(2026-11-03 사용자 확정). */
export function nextSeasonPrefill(
  league: V1AdminLeagueDetail,
  settings: LeagueSettings,
  periods: ReadonlyArray<{ durationMinutes: number }> | null | undefined,
): LeagueCreatePrefill {
  return {
    previousLeagueId: league.leagueId,
    previousTitle: league.title,
    title: `${league.title} 다음 시즌`,
    sportId: league.sportId ?? '',
    regionId: settings.regionId ?? '',
    genderCategory: settings.genderCategory ?? '',
    entryFee: league.entryFeeConfiguredAt == null ? null : league.entryFee ?? null,
    bankName: league.bankName ?? '',
    bankAccount: league.bankAccount ?? '',
    bankHolder: league.bankHolder ?? '',
    rosterLimit: league.maxPlayers == null
      ? { unlimited: true, minPlayers: '1', maxPlayers: '20' }
      : { unlimited: false, minPlayers: String(league.minPlayers ?? 1), maxPlayers: String(league.maxPlayers) },
    maxTeams: league.maxTeams == null ? '' : String(league.maxTeams),
    plannedFixtureCount: league.plannedFixtureCount == null ? '' : String(league.plannedFixtureCount),
    // 지난 리그가 정한 팀 파울 기준을 이어 간다(비워 뒀으면 새 리그도 기본값).
    teamFoulThreshold: league.teamFoulThreshold == null ? '' : String(league.teamFoulThreshold),
    showTeamFouls: league.showTeamFouls ?? true,
    periodMinutes: periods != null && COPYABLE_PERIOD_COUNTS.has(periods.length)
      ? periods.map((period) => String(period.durationMinutes))
      : null,
  };
}

/**
 * 다음 시즌 만들기(독립 리그 → 독립 리그, 2026-11-03 A안). 지난 리그 설정을 채운 리그 개설 화면을 연다.
 * 만들 수 있는 리그인지(전환·체계·상태·이미 이은 리그)는 부르는 쪽(`LeagueNextSeasonManage`)이 먼저 가른다.
 */
export function LeagueNextSeasonCreate({ league }: { league: V1AdminLeagueDetail }) {
  const settings = useLeagueSettings(league.leagueId);
  const periods = useTournamentPeriodSettings(league.leagueId);

  if (settings.isPending || periods.isPending) return <AdminPageSkeleton />;
  if (!settings.data || periods.isError || !periods.data) {
    return (
      <ErrorState
        message={extractErrorMessage(settings.error ?? periods.error, '지난 시즌 정보를 불러오지 못했어요.')}
        onRetry={() => {
          void settings.refetch();
          void periods.refetch();
        }}
      />
    );
  }
  return <LeagueCreateWizard key={league.leagueId} prefill={nextSeasonPrefill(league, settings.data, periods.data.periods)} />;
}
