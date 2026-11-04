'use client';

import Link from 'next/link';
import { AdminPageSkeleton } from '@/components/admin';
import { AlertBanner, ErrorState } from '@/components/v1-ui/primitives';
import { useAdminCanWrite } from '@/hooks/use-admin-can-write';
import { useLeagueSettings } from '@/hooks/use-league-settings';
import { useTournamentPeriodSettings } from '@/hooks/use-tournament-period-settings';
import { useV1AdminLeagueMatch } from '@/hooks/use-v1-api';
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
    periodMinutes: periods != null && COPYABLE_PERIOD_COUNTS.has(periods.length)
      ? periods.map((period) => String(period.durationMinutes))
      : null,
  };
}

/**
 * 다음 시즌 만들기(독립 리그 → 독립 리그, 2026-11-03 A안). 지난 리그 설정을 채운 리그 개설 화면을 연다.
 * 리그 체계 전환과 둘 중 하나만 하므로, 이미 다음 시즌을 이었거나 전환한 리그면 개설 화면 대신 그 사실을 알린다.
 */
export function LeagueNextSeasonCreate({ leagueId }: { leagueId: string }) {
  const canWrite = useAdminCanWrite();
  const league = useV1AdminLeagueMatch(leagueId);
  const settings = useLeagueSettings(leagueId);
  const periods = useTournamentPeriodSettings(leagueId);

  if (league.isPending || settings.isPending || periods.isPending) return <AdminPageSkeleton />;
  if (!league.data || !settings.data || periods.isError || !periods.data) {
    return (
      <ErrorState
        message={extractErrorMessage(league.error ?? settings.error ?? periods.error, '지난 시즌 정보를 불러오지 못했어요.')}
        onRetry={() => {
          void league.refetch();
          void settings.refetch();
          void periods.refetch();
        }}
      />
    );
  }
  const data = league.data;
  const blocked = !canWrite
    ? '조회 권한으로는 다음 시즌을 만들 수 없어요.'
    : data.seriesId != null
      ? '리그 체계에 속한 리그는 승강 확정으로 다음 시즌을 이어요.'
      : data.convertedToSeries === true
        ? '리그 체계로 전환한 리그는 다음 시즌을 따로 이을 수 없어요.'
        : data.state !== 'active' && data.state !== 'completed'
          ? '시즌을 시작했거나 끝낸 리그에서 다음 시즌을 만들 수 있어요.'
          : null;
  if (data.nextSeason) {
    return (
      <div className="flex flex-col gap-3">
        <AlertBanner tone="info" message={`이미 "${data.nextSeason.title}"이 다음 시즌으로 이어져 있어요.`} />
        <Link href={`/admin/league-matches/${encodeURIComponent(data.nextSeason.leagueId)}`} className="tm-btn tm-btn-md tm-btn-outline self-start">
          다음 시즌 관리로 가기
        </Link>
      </div>
    );
  }
  if (blocked !== null) return <AlertBanner tone="info" message={blocked} />;
  return <LeagueCreateWizard key={leagueId} prefill={nextSeasonPrefill(data, settings.data, periods.data.periods)} />;
}
