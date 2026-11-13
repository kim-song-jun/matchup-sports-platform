import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { NOTICES_FEED_PATH } from '@/lib/seo';

const CAMPAIGN_PATH_PREFIX = '/tournaments/campaigns/';
const PUBLIC_DETAIL_PATH =
  /^\/(matches|teams|team-matches|tournaments|notices|league-matches)\/([^/]+)(?:\/(bracket|results|awards|reviews))?$/;
const TOURNAMENT_FIXTURE_PATH = /^\/tournaments\/([^/]+)\/matches\/([^/]+)$/;
// 리그 경기 페이지는 주소의 leagueId 가 틀려도 경기가 속한 실제 리그로 열린다 — 판정에는 경기 id 만 쓴다.
const LEAGUE_FIXTURE_PATH = /^\/league-matches\/[^/]+\/fixtures\/([^/]+)$/;
const UUID_PATH_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const pathname = request.nextUrl.pathname;
  const tournamentFixture = pathname.match(TOURNAMENT_FIXTURE_PATH);
  if (tournamentFixture) return judgeTournamentFixture(tournamentFixture[1], tournamentFixture[2]);
  const leagueFixture = pathname.match(LEAGUE_FIXTURE_PATH);
  if (leagueFixture) return judgeLeagueFixture(leagueFixture[1]);

  if (pathname.startsWith(CAMPAIGN_PATH_PREFIX)) {
    const encodedSlug = pathname.slice(CAMPAIGN_PATH_PREFIX.length);
    const response = await fetch(
      `${getInternalApiOrigin()}/api/v1/tournaments/campaigns/${encodedSlug}/availability`,
      { method: 'HEAD', cache: 'no-store', headers: { accept: 'application/json' } },
    );

    return response.status === 404
      ? NextResponse.next({ status: 404 })
      : NextResponse.next();
  }

  // `/notices/:id` 매처에 같이 걸리는 정적 라우트 — UUID 가 아니라고 404 로 찍으면 안 된다.
  if (pathname === NOTICES_FEED_PATH) return NextResponse.next();

  const detailMatch = pathname.match(PUBLIC_DETAIL_PATH);
  if (!detailMatch) return NextResponse.next();
  const [, resource, id, subroute] = detailMatch;
  if (subroute && resource !== 'tournaments') return NextResponse.next();
  if ((resource === 'matches' || resource === 'teams' || resource === 'team-matches') && id === 'new') {
    return NextResponse.next();
  }
  if (!UUID_PATH_SEGMENT.test(id)) return NextResponse.next({ status: 404 });

  const response = await fetch(
    `${getInternalApiOrigin()}/api/v1/${resource}/${id}`,
    { cache: 'no-store', headers: { accept: 'application/json' } },
  );

  return response.status === 404
    ? NextResponse.next({ status: 404 })
    : NextResponse.next();
}

export const config = {
  matcher: [
    '/matches/:id',
    '/teams/:id',
    '/team-matches/:id',
    '/tournaments/:id',
    '/tournaments/:id/bracket',
    '/tournaments/:id/results',
    '/tournaments/:id/awards',
    '/tournaments/:id/reviews',
    '/tournaments/campaigns/:slug',
    '/notices/:id',
    '/league-matches/:id',
    '/tournaments/:id/matches/:fixtureId',
    '/league-matches/:leagueId/fixtures/:fixtureId',
  ],
};

// 없는 경기 id 는 loading.tsx 가 먼저 흘러 나가 상태 코드가 200 으로 굳는다 — 여기서 404 로 정한다.
// 숨긴 경기와 없는 경기는 서버가 같은 404 를 내므로 이 판정도 둘을 가르지 않는다. 429·5xx 는 통과시킨다.
async function judgeTournamentFixture(tournamentId: string, fixtureId: string): Promise<NextResponse> {
  if (!UUID_PATH_SEGMENT.test(tournamentId) || !UUID_PATH_SEGMENT.test(fixtureId)) {
    return NextResponse.next({ status: 404 });
  }
  const response = await fetch(
    `${getInternalApiOrigin()}/api/v1/tournaments/${tournamentId}/matches/${fixtureId}`,
    { method: 'HEAD', cache: 'no-store', headers: { accept: 'application/json' } },
  );
  return response.status === 404 ? NextResponse.next({ status: 404 }) : NextResponse.next();
}

// 리그 경기는 팀 매치 행이다 — 친선 팀 매치 id 로 열면 서버는 200 으로 답하지만 이 주소에 보여줄 경기는 없다.
async function judgeLeagueFixture(fixtureId: string): Promise<NextResponse> {
  if (!UUID_PATH_SEGMENT.test(fixtureId)) return NextResponse.next({ status: 404 });
  const response = await fetch(
    `${getInternalApiOrigin()}/api/v1/team-matches/${fixtureId}`,
    { cache: 'no-store', headers: { accept: 'application/json' } },
  );
  if (response.status === 404) return NextResponse.next({ status: 404 });
  if (!response.ok) return NextResponse.next();
  const envelope = (await response.json()) as { data?: { league?: unknown } | null };
  return envelope.data?.league ? NextResponse.next() : NextResponse.next({ status: 404 });
}

function getInternalApiOrigin(): string {
  const configured = process.env.INTERNAL_API_ORIGIN
    || process.env.NEXT_PUBLIC_API_URL?.replace(/\/api\/v1\/?$/, '');
  if (configured) return configured.replace(/\/$/, '');
  return process.env.NODE_ENV === 'production' ? 'http://v1_api:8121' : 'http://localhost:8121';
}
