import { http, HttpResponse } from 'msw';
import type { V1AdminLeagueDetail, V1AdminLeagueListItem, V1PublicLeagueDetail, V1PublicLeagueListItem } from '@/types/league-match';

const api = '*/api/v1';
const leagueId = 'league-visibility-fixture';

export const v1LeagueVisibilityFixture: {
  isPublic: boolean;
  adminDetail: V1AdminLeagueDetail;
  adminListItem: V1AdminLeagueListItem;
  publicDetail: V1PublicLeagueDetail;
  publicListItem: V1PublicLeagueListItem;
} = {
  isPublic: true,
  adminDetail: {
    leagueId,
    title: '공개 설정 검증 리그',
    state: 'active',
    isPublic: true,
    teamIds: ['team-1', 'team-2'],
    startsOn: '2026-10-01T00:00:00.000Z',
    registrationDeadlineAt: null,
    registrationOpen: false,
    sportCode: 'futsal',
    coverImageUrl: null,
    entryFee: 0,
    entryFeeConfiguredAt: null,
    bankName: null,
    bankAccount: null,
    bankHolder: null,
    activeRegistrationCount: 0,
    confirmedRegistrationCount: 0,
    fixtures: [],
  },
  adminListItem: {
    leagueId,
    title: '공개 설정 검증 리그',
    state: 'active',
    teamCount: 2,
    fixtureCount: 0,
    startsOn: '2026-10-01T00:00:00.000Z',
    endsOn: '2026-12-31T00:00:00.000Z',
    seriesId: null,
    seriesTitle: null,
    tierLabel: null,
    seasonNo: null,
  },
  publicDetail: {
    leagueId,
    title: '공개 설정 검증 리그',
    state: 'active',
    teamIds: ['team-1', 'team-2'],
    startsOn: '2026-10-01T00:00:00.000Z',
    endsOn: '2026-12-31T00:00:00.000Z',
    registrationDeadlineAt: null,
    registrationOpen: false,
    sportCode: 'futsal',
    coverImageUrl: null,
    entryFee: 0,
    entryFeeConfigured: false,
    fixtures: [],
    seriesSiblings: [],
  },
  publicListItem: {
    leagueId,
    title: '공개 설정 검증 리그',
    state: 'active',
    startsOn: '2026-10-01T00:00:00.000Z',
    endsOn: '2026-12-31T00:00:00.000Z',
    sport: { sportId: 'sport-soccer', code: 'soccer', name: '축구' },
    region: { regionId: 'region-seoul', name: '서울' },
    seriesId: null,
    tier: null,
    tierLabel: null,
    seasonNo: null,
    seriesTitle: null,
    teamCount: 2,
  },
};

function envelope<T>(data: T) {
  return HttpResponse.json({ status: 'success', data, timestamp: '2026-10-07T00:00:00.000Z' });
}

function notFound() {
  return HttpResponse.json({ status: 'error', statusCode: 404, code: 'NOT_FOUND', message: 'League was not found' }, { status: 404 });
}

export const v1LeagueVisibilityMswHandlers = [
  http.get(`${api}/admin/league-matches/:leagueId`, ({ params }) => {
    if (params.leagueId !== leagueId) return notFound();
    return envelope(v1LeagueVisibilityFixture.adminDetail);
  }),
  http.get(`${api}/admin/league-matches`, () => envelope({ items: [v1LeagueVisibilityFixture.adminListItem] })),
  http.patch(`${api}/admin/league-matches/:leagueId/visibility`, async ({ params, request }) => {
    if (params.leagueId !== leagueId) return notFound();
    const body = await request.json() as Record<string, unknown>;
    if (Object.keys(body).length !== 1 || typeof body.isPublic !== 'boolean') {
      return HttpResponse.json({ status: 'error', code: 'BAD_REQUEST', message: 'isPublic must be a boolean' }, { status: 400 });
    }
    v1LeagueVisibilityFixture.isPublic = body.isPublic;
    v1LeagueVisibilityFixture.adminDetail.isPublic = body.isPublic;
    return envelope({ leagueId, isPublic: body.isPublic });
  }),
  http.get(`${api}/league-matches`, () => envelope({
    items: v1LeagueVisibilityFixture.isPublic ? [v1LeagueVisibilityFixture.publicListItem] : [],
    pageInfo: { nextCursor: null, hasNext: false },
  })),
  http.get(`${api}/league-matches/:leagueId`, ({ params }) => {
    if (params.leagueId !== leagueId || !v1LeagueVisibilityFixture.isPublic) return notFound();
    return envelope(v1LeagueVisibilityFixture.publicDetail);
  }),
];
