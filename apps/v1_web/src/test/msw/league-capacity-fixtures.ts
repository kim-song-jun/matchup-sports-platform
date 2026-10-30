import { resolveTournamentRegistrationBlock } from '@/lib/tournament-registration-availability';
import type { V1TournamentRegistrationStatus } from '@/types/api';
import type { V1AdminLeagueDetail, V1CreateLeaguePayload, V1PublicLeagueDetail } from '@/types/league-match';
import type { LeagueSettings } from '@/types/league-settings';

export const LEAGUE_CAPACITY_MSW = {
  reservedId: '14500000-0000-4000-8000-000000000001',
  unreservedId: '14500000-0000-4000-8000-000000000002',
  sportId: '14500000-0000-4000-8000-000000000010',
  teamIds: ['14500000-0000-4000-8000-000000000011', '14500000-0000-4000-8000-000000000012'],
  regionId: 'region-seoul-jongno',
} as const;

type CapacityRegistration = {
  readonly teamId: string;
  readonly status: V1TournamentRegistrationStatus;
  readonly entrySource: 'applied' | 'seeded' | 'promoted' | null;
};

/** Mutable rows model the MSW persistence adapter; getters never modify them. */
export type CapacityLeagueRow = {
  detail: V1AdminLeagueDetail;
  settings: LeagueSettings & { startsOn: string; endsOn: string };
  registrations: CapacityRegistration[];
};

const pendingStatuses: readonly V1TournamentRegistrationStatus[] = ['awaiting_payment', 'payment_checking', 'paid'];
const activeStatuses: readonly V1TournamentRegistrationStatus[] = [
  'submitted', 'awaiting_payment', 'payment_checking', 'paid', 'confirmed', 'waitlisted', 'cancel_requested',
];

/**
 * 접수 창이 열려 있는가 — 서버 `registration-window.ts` 와 같은 규칙(접수 중이고 마감 전)을 웹 공용 판정으로 본다.
 * 정원은 응답이 따로 세므로 무제한으로 넘겨 접수 창만 가른다.
 */
export function leagueRegistrationWindowOpen(status: string, registrationDeadlineAt: string | null): boolean {
  return resolveTournamentRegistrationBlock({ kind: 'regular_league', status, registrationDeadlineAt, maxTeams: null, confirmedCount: 0 }) === null;
}

export function leagueCapacityCounts(row: CapacityLeagueRow) {
  const applied = row.registrations.filter(registration => registration.entrySource === 'applied' || registration.entrySource === null);
  return {
    confirmedCount: row.registrations.filter(registration => registration.status === 'confirmed').length,
    pendingPaymentCount: row.registrations.filter(registration => pendingStatuses.includes(registration.status)).length,
    activeRegistrationCount: applied.filter(registration => activeStatuses.includes(registration.status)).length,
    confirmedRegistrationCount: applied.filter(registration => registration.status === 'confirmed').length,
  };
}

export function leagueCapacityAdminDetail(row: CapacityLeagueRow): V1AdminLeagueDetail {
  return {
    ...row.detail,
    ...leagueCapacityCounts(row),
    registrationOpen: leagueRegistrationWindowOpen(row.settings.status, row.settings.registrationDeadlineAt),
    teamIds: row.registrations.filter(registration => registration.status === 'confirmed').map(registration => registration.teamId),
  };
}

export function leagueCapacityPublicDetail(row: CapacityLeagueRow): V1PublicLeagueDetail {
  const detail = leagueCapacityAdminDetail(row);
  return {
    leagueId: detail.leagueId, title: detail.title, state: detail.state,
    teamIds: detail.teamIds, startsOn: detail.startsOn, endsOn: row.settings.endsOn,
    minPlayers: detail.minPlayers, maxPlayers: detail.maxPlayers, maxTeams: detail.maxTeams,
    confirmedCount: detail.confirmedCount, pendingPaymentCount: detail.pendingPaymentCount,
    registrationDeadlineAt: detail.registrationDeadlineAt, registrationOpen: detail.registrationOpen,
    sportCode: detail.sportCode, coverImageUrl: detail.coverImageUrl ?? detail.listImageUrl ?? null, listImageUrl: detail.listImageUrl, entryFee: detail.entryFee,
    entryFeeConfigured: detail.entryFeeConfiguredAt !== null, rulesText: row.settings.rulesText,
    plannedFixtureCount: detail.plannedFixtureCount, fixtures: detail.fixtures, seriesSiblings: [],
  };
}

/** 서버 `create()` 와 같은 모양 — 새 리그는 초안이고, 보낸 참가비는 확정한 것으로 본다(2026-10-27). */
export function createCapacityLeagueRow(input: V1CreateLeaguePayload & { readonly leagueId: string }): CapacityLeagueRow {
  const registrationDeadlineAt = input.registrationDeadlineAt ? new Date(input.registrationDeadlineAt).toISOString() : null;
  const paid = input.entryFee !== undefined && input.entryFee > 0;
  return {
    settings: {
      leagueId: input.leagueId, title: input.title, rulesText: '', regionId: input.regionId,
      startsOn: new Date(input.startsOn).toISOString(), endsOn: new Date(input.endsOn).toISOString(), registrationDeadlineAt,
      plannedFixtureCount: input.plannedFixtureCount ?? null, maxTeams: input.maxTeams ?? null,
      updatedAt: '2026-10-15T00:00:00.000Z', status: 'draft', sportName: '풋살',
    },
    detail: {
      leagueId: input.leagueId, title: input.title, state: 'draft', lifecycleStatus: 'draft', isPublic: true,
      sportId: input.sportId, teamIds: [], startsOn: new Date(input.startsOn).toISOString(),
      minPlayers: input.minPlayers ?? 1, maxPlayers: input.maxPlayers ?? null, maxTeams: input.maxTeams ?? null,
      plannedFixtureCount: input.plannedFixtureCount ?? null,
      confirmedCount: 0, pendingPaymentCount: 0, registrationDeadlineAt, registrationOpen: false,
      sportCode: 'futsal', coverImageUrl: null, listImageUrl: null, entryFee: input.entryFee ?? 0,
      entryFeeConfiguredAt: input.entryFee === undefined ? null : '2026-10-15T00:00:00.000Z',
      bankName: paid ? input.bankName ?? null : null, bankAccount: paid ? input.bankAccount ?? null : null,
      bankHolder: paid ? input.bankHolder ?? null : null,
      activeRegistrationCount: 0, confirmedRegistrationCount: 0, fixtures: [],
    },
    registrations: [...new Set(input.teamIds)].map(teamId => ({ teamId, status: 'confirmed', entrySource: 'seeded' })),
  };
}

export function createLeagueCapacityFixtures(): Map<string, CapacityLeagueRow> {
  const base = {
    title: '참가팀 정원 검증 리그', sportId: LEAGUE_CAPACITY_MSW.sportId, regionId: LEAGUE_CAPACITY_MSW.regionId,
    startsOn: '2098-01-01T00:00:00.000Z', endsOn: '2098-12-31T00:00:00.000Z',
    minPlayers: 2, maxPlayers: 4, teamIds: [...LEAGUE_CAPACITY_MSW.teamIds],
  };
  const reserved = createCapacityLeagueRow({ ...base, leagueId: LEAGUE_CAPACITY_MSW.reservedId, maxTeams: 5 });
  reserved.registrations = [
    { teamId: LEAGUE_CAPACITY_MSW.teamIds[0], status: 'confirmed', entrySource: 'seeded' },
    { teamId: LEAGUE_CAPACITY_MSW.teamIds[1], status: 'confirmed', entrySource: 'promoted' },
    { teamId: '14500000-0000-4000-8000-000000000013', status: 'awaiting_payment', entrySource: 'applied' },
    { teamId: '14500000-0000-4000-8000-000000000014', status: 'payment_checking', entrySource: 'applied' },
    { teamId: '14500000-0000-4000-8000-000000000015', status: 'paid', entrySource: 'applied' },
  ];
  const unreserved = createCapacityLeagueRow({ ...base, leagueId: LEAGUE_CAPACITY_MSW.unreservedId, maxTeams: 1 });
  const unreservedStatuses: readonly V1TournamentRegistrationStatus[] = ['draft', 'submitted', 'waitlisted', 'cancelled'];
  unreserved.registrations = unreservedStatuses.map((status, index) => ({
    teamId: `14500000-0000-4000-8000-${String(index + 21).padStart(12, '0')}`, status, entrySource: 'applied',
  }));
  // 두 정원 검증 리그는 접수 중이다 — 리그도 대회처럼 접수 중일 때만 신청을 받는다.
  for (const row of [reserved, unreserved]) {
    row.settings.status = 'open';
    row.settings.registrationDeadlineAt = '2097-12-31T00:00:00.000Z';
    row.detail.lifecycleStatus = 'open';
    row.detail.registrationDeadlineAt = row.settings.registrationDeadlineAt;
    row.detail.registrationOpen = true;
  }
  return new Map([[reserved.detail.leagueId, reserved], [unreserved.detail.leagueId, unreserved]]);
}
