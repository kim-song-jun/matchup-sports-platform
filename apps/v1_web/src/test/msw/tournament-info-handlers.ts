import { http, HttpResponse } from 'msw';
import type { TournamentPeriodSettingsResponse } from '@/hooks/use-tournament-period-settings';
import type { V1AdminTournamentBracket, V1LineupSizeOptions, V1Sport, V1Tournament } from '@/types/api';

const DEFAULT_TIE_BREAK: V1Tournament['tieBreakOrder'] = [
  'points', 'head_to_head', 'goal_difference', 'goals_for', 'fair_play', 'fewest_goals_against', 'seeded_draw',
];

/** 접수 중인 무료 풋살 대회 — 장소와 명단 제출 마감이 비어 있다. */
export function createTournamentInfoFixture(overrides: Partial<V1Tournament> = {}): V1Tournament {
  return {
    id: 'tournament-1',
    sportId: 'sport-futsal',
    title: 'Teameet Futsal Cup',
    status: 'open',
    format: 'group_knockout',
    formatChangeBlockedReason: null,
    tieBreakOrder: DEFAULT_TIE_BREAK,
    tieBreakOrderBlockedReason: null,
    registrationDeadlineAt: '2026-12-17T14:59:00.000Z',
    rosterDeadlineAt: null,
    bracketPublishedAt: null,
    bracketPublishScheduledAt: null,
    scheduledAt: '2026-12-20T00:00:00.000Z',
    scheduledEndAt: null,
    venue: null,
    parkingInfo: null,
    latitude: null,
    longitude: null,
    coverImageUrl: null,
    listImageUrl: null,
    showDetailImage: true,
    teamCount: 8,
    minPlayers: 6,
    maxPlayers: 10,
    competitionConfigVersionId: 'config-1',
    lineupMaxPlayers: 6,
    lineupMinPlayers: 4,
    lineupSizeOptions: [5, 6],
    substitutionMode: 'rolling',
    maxSubstitutions: null,
    substitutionModeOptions: ['limited', 'rolling'],
    genderCategory: 'male',
    genderMinMale: null,
    genderMaxMale: null,
    genderMinFemale: null,
    genderMaxFemale: null,
    minMatchesPerTeam: null,
    entryFee: 0,
    prizePool: null,
    prizeSummary: null,
    prizeBreakdown: null,
    promoHomeEnabled: false,
    promoHomeTitle: null,
    promoHomeSubtitle: null,
    promoHomeImageUrl: null,
    promoHomeBadgeText: null,
    promoHomeDateText: null,
    promoHomeTeamsText: null,
    promoHomeLocationText: null,
    promoHomePrizeText: null,
    promoHomePriority: 0,
    promoListEnabled: false,
    promoListTitle: null,
    promoListSubtitle: null,
    promoListImageUrl: null,
    promoListBadgeText: null,
    promoListDateText: null,
    promoListTeamsText: null,
    promoListLocationText: null,
    promoListPrizeText: null,
    promoListPriority: 0,
    bankName: null,
    bankAccount: null,
    bankHolder: null,
    yellowAccumulationLimit: null,
    redCardSuspensionMatches: null,
    teamFoulThreshold: null,
    rulesText: null,
    refundPolicyText: null,
    registrationCount: 5,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
}

const period = (code: string, label: string, durationMinutes: number) => ({ code, label, durationMinutes, extraTime: false });

type FailTarget = 'tournament' | 'periods';
type Failure = { status: number; body: { code?: string; message?: string } };

const ok = (data: unknown) => HttpResponse.json({ status: 'success', data, timestamp: new Date().toISOString() });
const failed = ({ status, body }: Failure) =>
  HttpResponse.json(
    { status: 'error', statusCode: status, code: body.code ?? 'BAD_REQUEST', message: body.message ?? '요청을 처리하지 못했어요.', timestamp: new Date().toISOString() },
    { status },
  );
const conflict: Failure = { status: 409, body: { code: 'TOURNAMENT_VERSION_CONFLICT', message: '대회 정보가 다른 곳에서 먼저 바뀌었어요.' } };

/**
 * 대회 정보 시트가 부르는 엔드포인트의 상태 있는 가짜 서버. 대회 PATCH·경기 시간 PATCH 는 같은 버전(대회 `updatedAt`)으로
 * CAS 를 보고, 성공하면 버전을 올린다.
 */
export function createTournamentInfoServer(initial: Partial<V1Tournament> = {}) {
  const failures: Record<FailTarget, Failure[]> = { tournament: [], periods: [] };
  let tick = 0;
  const state = {
    tournament: createTournamentInfoFixture(initial),
    periods: {
      tournamentId: 'tournament-1',
      kind: 'regular_tournament',
      competitionConfigVersionId: 'config-1',
      expectedVersion: null,
      periods: [period('FIRST_HALF', '전반', 20), period('SECOND_HALF', '후반', 20)],
      legacyPeriodCount: null,
      requiresDurationInput: false,
      stageOverrides: [],
      groupOverrides: [],
      matchOverrideCount: 0,
    } as TournamentPeriodSettingsResponse,
    bracket: { groups: [], fixtures: [], standings: [], slots: [] } as V1AdminTournamentBracket,
    lineupOptions: {
      sportId: 'sport-futsal',
      supported: true,
      options: [5, 6],
      defaultMaxPlayers: 6,
      substitutionModes: ['limited', 'rolling'],
      defaultSubstitutionMode: 'rolling',
      defaultMaxSubstitutions: 5,
      defaultPeriods: [{ label: '전반', durationMinutes: 20 }, { label: '후반', durationMinutes: 20 }],
    } as V1LineupSizeOptions,
    sports: [
      { id: 'sport-futsal', code: 'futsal', name: '풋살', levels: [] },
      { id: 'sport-football', code: 'football', name: '축구', levels: [] },
    ] as unknown as V1Sport[],
    /** 대회 목록 조회가 돌려주는 대회들(최근 순). */
    tournamentList: [] as V1Tournament[],
    tournamentListStatus: 200,
    /** 200 이 아니면 출전 인원·교체 선택지 조회가 그 상태로 실패한다. */
    lineupOptionsStatus: 200,
    /** 단계별 순위 순서 PUT — `{ stageKey, ...본문 }`. */
    stageTieBreakPuts: [] as Record<string, unknown>[],
    /** 서버에 닿은 대회 PATCH 본문(실패한 것 포함) — 순서대로. */
    patches: [] as Record<string, unknown>[],
    periodPatches: [] as Record<string, unknown>[],
    /** 다음 PATCH 한 번을 이 응답으로 실패시킨다. */
    failNext(target: FailTarget, status: number, body: Failure['body'] = {}) {
      failures[target].push({ status, body });
    },
  };

  const bump = () => {
    tick += 1;
    state.tournament = { ...state.tournament, updatedAt: new Date(Date.parse('2026-11-01T00:00:00.000Z') + tick * 1000).toISOString() };
  };

  const handlers = [
    http.post('*/api/v1/logs/client-error', () => ok(null)),
    http.get('*/api/v1/master/sports', () => ok(state.sports)),
    http.get('*/api/v1/admin/competition-configs/lineup-size-options', () =>
      state.lineupOptionsStatus === 200 ? ok(state.lineupOptions) : failed({ status: state.lineupOptionsStatus, body: {} }),
    ),
    http.put('*/api/v1/admin/tournaments/:id/stages/:stageKey/tie-break-order', async ({ request, params }) => {
      state.stageTieBreakPuts.push({ stageKey: params.stageKey, ...((await request.json()) as Record<string, unknown>) });
      return ok({ revision: (state.tournament.stagePlanRevision ?? 0) + 1, stageTieBreak: state.tournament.stageTieBreak });
    }),
    http.get('*/api/v1/admin/tournaments/:id/bracket', () => ok(state.bracket)),
    http.get('*/api/v1/admin/tournaments/:id/periods', () => ok({ ...state.periods, expectedVersion: state.tournament.updatedAt })),
    http.patch('*/api/v1/admin/tournaments/:id/periods', async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      state.periodPatches.push(body);
      const failure = failures.periods.shift();
      if (failure) return failed(failure);
      if (body.expectedVersion !== state.tournament.updatedAt) return failed(conflict);
      const next = Array.isArray(body.periods)
        ? (body.periods as Array<{ durationMinutes: number }>).map((row, index, rows) =>
            period(`P${index + 1}`, rows.length === 1 ? '단판' : index === 0 ? '전반' : '후반', row.durationMinutes))
        : null;
      const phase = body.phase as TournamentPeriodSettingsResponse['stageOverrides'][number]['phase'] | undefined;
      if (phase) {
        const rest = state.periods.stageOverrides.filter((override) => override.phase !== phase);
        state.periods = {
          ...state.periods,
          stageOverrides: body.inheritDefault
            ? rest
            : [...rest, { phase, competitionConfigVersionId: `config-${phase}`, periods: next, legacyPeriodCount: null }],
        };
      } else if (next) {
        state.periods = { ...state.periods, periods: next };
      }
      bump();
      return ok({ ...state.periods, expectedVersion: state.tournament.updatedAt, fixturesRepointed: 0 });
    }),
    http.get('*/api/v1/admin/tournaments', () =>
      state.tournamentListStatus === 200
        ? ok({ items: state.tournamentList, pageInfo: { nextCursor: null, hasNextPage: false } })
        : failed({ status: state.tournamentListStatus, body: {} }),
    ),
    http.get('*/api/v1/admin/tournaments/:id', () => ok(state.tournament)),
    http.patch('*/api/v1/admin/tournaments/:id', async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      state.patches.push(body);
      const failure = failures.tournament.shift();
      if (failure) return failed(failure);
      if (body.expectedVersion !== state.tournament.updatedAt) return failed(conflict);
      const { expectedVersion: _expectedVersion, ...fields } = body;
      state.tournament = { ...state.tournament, ...(fields as Partial<V1Tournament>) };
      bump();
      return ok(state.tournament);
    }),
  ];

  return { handlers, state };
}
