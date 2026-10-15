import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { makeSlot } from '@/test/bracket-canvas-fixtures';
import { kstDatetimeLocalToIso } from '@/lib/kst-calendar';
import type { V1AdminMe } from '@/types/api';
import type { V1AdminLeagueDetail, V1AdminLeagueTeamsResponse, V1LeagueFixture } from '@/types/league-match';

export const MOBILE_LEAGUE_ID = 'synthetic-mobile-league-138';
export const MOBILE_FIXTURE_ID = 'synthetic-mobile-fixture-138';
const STAMP = '2026-10-13T00:00:00.000Z';
type HiddenMobileFixture = V1LeagueFixture & { deletedAt: string };

export function mobileFixture(overrides: Partial<V1LeagueFixture> = {}): V1LeagueFixture {
  return {
    teamMatchId: MOBILE_FIXTURE_ID, title: '모바일 리그 1주차',
    homeTeamId: 'synthetic-home', awayTeamId: 'synthetic-away',
    startAt: '2100-01-04T10:00:00.000Z', placeName: '합성 풋살장',
    placeAddress: null, status: 'matched', resultStage: 'not_entered',
    gameState: 'SCHEDULED', game: null, homeScore: null, awayScore: null,
    ...overrides,
  };
}

export function mobileLeague(fixtures: V1LeagueFixture[] = [mobileFixture()]): V1AdminLeagueDetail {
  return {
    leagueId: MOBILE_LEAGUE_ID, title: '합성 모바일 리그', state: 'active', isPublic: false,
    teamIds: ['synthetic-home', 'synthetic-away', 'synthetic-third'],
    startsOn: '2100-01-01T00:00:00.000Z', registrationDeadlineAt: null, registrationOpen: false,
    sportCode: 'futsal', coverImageUrl: null, entryFee: 0, entryFeeConfiguredAt: null,
    bankName: null, bankAccount: null, bankHolder: null,
    activeRegistrationCount: 0, confirmedRegistrationCount: 0,
    recentVenues: [], defaultPlace: null, slots: [], fixtures,
  };
}

const teams: V1AdminLeagueTeamsResponse = {
  leagueId: MOBILE_LEAGUE_ID,
  teams: [
    { teamId: 'synthetic-home', name: '합성 홈팀', registrationId: 'synthetic-reg-home', status: 'active', memberCount: 5, logoUrl: null },
    { teamId: 'synthetic-away', name: '합성 원정팀', registrationId: 'synthetic-reg-away', status: 'active', memberCount: 5, logoUrl: null },
    { teamId: 'synthetic-third', name: '합성 새팀', registrationId: 'synthetic-reg-third', status: 'active', memberCount: 5, logoUrl: null },
  ],
};

export const mobileEditorServer = setupServer();
export const mobileEditorFixture: {
  league: V1AdminLeagueDetail;
  canWrite: boolean;
  updateFails: boolean;
  templateWrites: unknown[];
  fixtureWrites: Array<{ fixtureId: string; body: unknown }>;
  hiddenFixtures: HiddenMobileFixture[];
} = {
  league: mobileLeague(),
  canWrite: true,
  updateFails: false,
  templateWrites: [],
  fixtureWrites: [],
  hiddenFixtures: [],
};

function success(data: unknown) {
  return HttpResponse.json({ status: 'success', data, timestamp: STAMP });
}
function failure(status: number, code: string, message: string) {
  return HttpResponse.json({ status: 'error', statusCode: status, code, message, timestamp: STAMP }, { status });
}

export function resetMobileEditorFixture() {
  mobileEditorFixture.league = mobileLeague();
  mobileEditorFixture.canWrite = true;
  mobileEditorFixture.updateFails = false;
  mobileEditorFixture.templateWrites = [];
  mobileEditorFixture.fixtureWrites = [];
  mobileEditorFixture.hiddenFixtures = [];
  mobileEditorServer.use(
    http.get('*/api/v1/admin/me', () => success({
      userId: 'synthetic-admin-138', adminUserId: 'synthetic-admin-user-138', adminRole: 'ops',
      status: 'active', capabilities: mobileEditorFixture.canWrite ? ['status:write'] : [], lastActiveAt: null,
    } satisfies V1AdminMe)),
    http.get(`*/api/v1/admin/league-matches/${MOBILE_LEAGUE_ID}`, () => success(mobileEditorFixture.league)),
    http.get(`*/api/v1/admin/league-matches/${MOBILE_LEAGUE_ID}/teams`, () => success(teams)),
    http.get(`*/api/v1/admin/tournaments/${MOBILE_LEAGUE_ID}/periods`, () => success({
      tournamentId: MOBILE_LEAGUE_ID, competitionConfigVersionId: 'synthetic-config-138', expectedVersion: 'synthetic-version-138',
      periods: [{ code: 'FIRST', label: '전반', durationMinutes: 20, extraTime: false }, { code: 'SECOND', label: '후반', durationMinutes: 20, extraTime: false }],
      legacyPeriodCount: null, requiresDurationInput: false,
    })),
    http.get(`*/api/v1/admin/tournaments/${MOBILE_LEAGUE_ID}/registrations`, () => success({ items: [], truncated: false })),
    http.get(`*/api/v1/tournament-ops/tournaments/${MOBILE_LEAGUE_ID}/fields`, () => success({ items: [] })),
    http.get(`*/api/v1/tournament-ops/tournaments/${MOBILE_LEAGUE_ID}/staff`, () => success({ items: [] })),
    http.get('*/api/v1/teams', () => success({ items: [], pageInfo: { hasNextPage: false, nextCursor: null } })),
    http.get('*/api/v1/public/integrations/kakao-maps-key', () => success({ kakaoMapsJsKey: null })),
    http.post(`*/api/v1/admin/league-matches/${MOBILE_LEAGUE_ID}/fixtures/template`, async ({ request }) => {
      const body: unknown = await request.json();
      mobileEditorFixture.templateWrites.push(body);
      if (!mobileEditorFixture.canWrite) return failure(403, 'FORBIDDEN', '읽기 전용 권한이에요.');
      if (mobileEditorFixture.league.state === 'completed') return failure(409, 'LEAGUE_ENDED', '끝난 리그의 구조는 바꿀 수 없어요.');
      if (typeof body !== 'object' || body === null || !('schedule' in body) || typeof body.schedule !== 'object' || body.schedule === null || !('dates' in body.schedule) || !Array.isArray(body.schedule.dates) || !('time' in body.schedule) || typeof body.schedule.time !== 'string') {
        return failure(400, 'INVALID_TEMPLATE', '경기 날짜와 시각이 필요해요.');
      }
      // applyTemplate()는 취소 이력도 existing으로 읽고, replacement 보호만 live 행에 적용해요.
      if (mobileEditorFixture.league.fixtures.length > 0 && (!('replaceExisting' in body) || body.replaceExisting !== true)) {
        return failure(409, 'LEAGUE_FIXTURES_EXIST', '이미 대진이 생성된 리그예요.');
      }
      if (mobileEditorFixture.league.fixtures.some((fixture) => fixture.status !== 'cancelled' && (fixture.resultStage === 'official' || fixture.resultStage === 'voided' || (fixture.gameState !== null && fixture.gameState !== undefined && fixture.gameState !== 'SCHEDULED')))) {
        return failure(409, 'BRACKET_LOCKED', '이미 시작했거나 결과가 있는 경기가 있어 대진 템플릿으로 바꿀 수 없어요.');
      }
      const dates: string[] = body.schedule.dates.filter((date): date is string => typeof date === 'string');
      if (dates.length !== 3 || !('teamCount' in body) || body.teamCount !== 3 || !('legs' in body) || body.legs !== 1) return failure(400, 'INVALID_TEMPLATE', '3팀 단일 리그의 3개 경기 날짜가 필요해요.');
      const time = body.schedule.time;
      const createdFixtures: V1LeagueFixture[] = [];
      for (const [index, date] of dates.entries()) {
        const startAt = kstDatetimeLocalToIso(`${date}T${time}`);
        if (startAt === null) return failure(400, 'INVALID_TEMPLATE', '경기 날짜와 시각 형식이 올바르지 않아요.');
        createdFixtures.push(mobileFixture({
          teamMatchId: `synthetic-template-${index + 1}`, title: `모바일 생성 ${index + 1}주차`,
          homeTeamId: null, awayTeamId: null,
          homeSlotId: `synthetic-slot-${index + 1}`, awaySlotId: `synthetic-slot-${(index + 1) % 3 + 1}`,
          startAt,
        }));
      }
      // replaceLeagueFixturesInTx()는 이력을 보존하고 기존 대진 전부를 deletedAt으로 현재 목록에서 숨겨요.
      mobileEditorFixture.hiddenFixtures.push(
        ...mobileEditorFixture.league.fixtures.map((fixture): HiddenMobileFixture => ({
          ...fixture, status: 'cancelled', homeSlotId: null, awaySlotId: null,
          gameState: fixture.gameState === 'SCHEDULED' ? 'CANCELLED' : fixture.gameState,
          deletedAt: STAMP,
        })),
      );
      mobileEditorFixture.league = {
        ...mobileEditorFixture.league,
        slots: [1, 2, 3].map((position) => makeSlot({ id: `synthetic-slot-${position}`, position, label: `${position}번 자리` })),
        // detail() GET은 deletedAt:null만 반환하므로 숨긴 대진은 현재 fixtures에 포함하지 않아요.
        fixtures: createdFixtures.sort((left, right) => left.startAt.localeCompare(right.startAt)),
      };
      return success({ slots: 3, fixtures: 3 });
    }),
    http.patch(`*/api/v1/admin/league-matches/${MOBILE_LEAGUE_ID}/fixtures/:fixtureId`, async ({ params, request }) => {
      const body: unknown = await request.json();
      const fixtureId = String(params.fixtureId);
      mobileEditorFixture.fixtureWrites.push({ fixtureId, body });
      if (!mobileEditorFixture.canWrite) return failure(403, 'FORBIDDEN', '읽기 전용 권한이에요.');
      if (mobileEditorFixture.league.state === 'completed') return failure(409, 'LEAGUE_ENDED', '끝났거나 취소된 리그는 대진을 만들거나 바꿀 수 없어요.');
      if (mobileEditorFixture.updateFails) return failure(409, 'FIXTURE_HAS_RESULT', '경기 결과가 생겨 저장하지 못했어요.');
      const fixture = mobileEditorFixture.league.fixtures.find((candidate) => candidate.teamMatchId === fixtureId);
      if (!fixture || typeof body !== 'object' || body === null) return failure(404, 'FIXTURE_NOT_FOUND', '경기를 찾을 수 없어요.');
      const title = 'title' in body && typeof body.title === 'string' ? body.title : fixture.title;
      const startAt = 'startsAt' in body && typeof body.startsAt === 'string' ? body.startsAt : fixture.startAt;
      const updated = { ...fixture, title, startAt };
      mobileEditorFixture.league = { ...mobileEditorFixture.league, fixtures: mobileEditorFixture.league.fixtures.map((candidate) => candidate.teamMatchId === fixtureId ? updated : candidate) };
      return success({ teamMatchId: fixtureId, title, startAt, placeName: fixture.placeName, placeAddress: fixture.placeAddress ?? null });
    }),
    http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })),
  );
}
