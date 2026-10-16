import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import LeagueFixtureDetailClient from './league-fixture-detail-client';
import { JsonLd } from '@/components/seo/json-ld';
import { formatTournamentDateTimeLong } from '@/lib/date-utils';
import { leagueFixtureWeekNumber, withDerivedWeek } from '@/lib/league-fixture-week';
import { buildNoIndexMetadata, buildPublicMetadata } from '@/lib/seo';
import { buildBreadcrumbLd, buildTeamMatchEventLd } from '@/lib/structured-data';
import type { V1TeamMatch } from '@/types/api';
import type { V1LeagueStandingsResponse, V1PublicLeagueDetail } from '@/types/league-match';
import { leaguePath, loadPublic } from '../../load-public';

interface Props {
  params: Promise<{ leagueId: string; fixtureId: string }>;
}

// 리그 대진은 팀 매치 행이다 — 화면(클라이언트)도 같은 `/team-matches/:id` 를 읽는다.
const fixtureApiPath = (fixtureId: string) => `/team-matches/${encodeURIComponent(fixtureId)}`;
const fixturePath = (leagueId: string, fixtureId: string) =>
  `${leaguePath(leagueId)}/fixtures/${encodeURIComponent(fixtureId)}`;

// 저장된 대진 제목의 주차는 생성 시점 값이라 현재 일정에서 다시 파생한다.
function resolveFixtureTitle(fixture: V1TeamMatch, league: V1PublicLeagueDetail | null, fixtureId: string): string {
  if (!league) return fixture.title;
  const target = league.fixtures.find((item) => item.teamMatchId === fixtureId);
  return target ? withDerivedWeek(fixture.title, leagueFixtureWeekNumber(league.fixtures, target)) : fixture.title;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { leagueId, fixtureId } = await params;
  const path = fixturePath(leagueId, fixtureId);
  const fixture = await loadPublic<V1TeamMatch>(fixtureApiPath(fixtureId));
  if (!fixture.ok) {
    return buildNoIndexMetadata('리그 경기 정보를 확인할 수 없어요');
  }
  if (!fixture.data) return buildNoIndexMetadata('경기를 찾을 수 없어요');

  const { league: leagueRef, startsAt, place } = fixture.data;
  if (!leagueRef) return buildNoIndexMetadata('리그 경기 정보를 확인할 수 없어요');
  const leagueResult = await loadPublic<V1PublicLeagueDetail>(leaguePath(leagueRef.leagueId));
  if (!leagueResult.ok || !leagueResult.data) {
    return buildNoIndexMetadata('리그 경기 정보를 확인할 수 없어요');
  }
  const leagueDetail = leagueResult.data;
  const title = resolveFixtureTitle(fixture.data, leagueDetail, fixtureId);
  // 주소의 leagueId 가 틀려도(깨진 링크) canonical 은 경기가 실제로 속한 리그를 가리킨다.
  const canonical = leagueRef ? fixturePath(leagueRef.leagueId, fixtureId) : path;
  const parts = [leagueRef?.title ?? '정규 리그', formatTournamentDateTimeLong(startsAt), place?.name].filter(Boolean);
  return buildPublicMetadata({
    title,
    description: `${parts.join(' · ')}. 리그 경기의 일정과 결과를 확인해 보세요.`,
    path: canonical,
  });
}

// AppChrome 승격(U31) — 셸은 route-chrome 테이블(lib/route-chrome/fragments/
// league-matches.ts)이 정적으로 그린다. backHref는 이 경기가 속한 리그의 순위표/일정
// 화면 — 딥링크(알림·리다이렉트)로 바로 들어와도 리그로 나갈 수 있다.
export default async function LeagueFixturePage({ params }: Props) {
  const { fixtureId } = await params;
  const fixture = await loadPublic<V1TeamMatch>(fixtureApiPath(fixtureId));
  if (!fixture.ok) {
    throw new Error('리그 경기 상세에 필요한 공개 경기 정보를 불러오지 못했어요');
  }
  // 이 경로는 proxy.ts matcher 밖이라 없는 경기의 HTTP 404 를 여기서 낸다(조회 실패는 404 가 아니다).
  if (!fixture.data) notFound();
  const detail = fixture.data;
  // 존재하는 친선 팀매치가 잘못된 리그 fixture URL로 들어온 것은 upstream 장애가 아니라 route 404다.
  if (!detail.league) notFound();
  // 이미 공개 경기에서 확인한 실제 소속 리그를 기준으로 상세와 관련 공개 응답을 함께 seed 한다.
  const league = detail.league;
  const actualLeagueId = league.leagueId;
  const leagueResult = await loadPublic<V1PublicLeagueDetail>(leaguePath(actualLeagueId));
  if (!leagueResult.ok || !leagueResult.data) {
    throw new Error('리그 경기 상세에 필요한 공개 리그 정보를 불러오지 못했어요');
  }
  const leagueDetail = leagueResult.data;
  const standingsResult = await loadPublic<V1LeagueStandingsResponse>(`${leaguePath(actualLeagueId)}/standings`);
  const standings = standingsResult.ok ? standingsResult.data : null;
  // 이벤트 canonical 은 실제 소속 리그 경로를 우선하고, 상위 리그 탐색은 아래 breadcrumb 로 제공한다.
  const title = resolveFixtureTitle(detail, leagueDetail, fixtureId);
  const eventLd = buildTeamMatchEventLd(
    { ...detail, title },
    fixtureId,
    { path: fixturePath(league.leagueId, fixtureId) },
  );

  return (
    <>
      {eventLd ? <JsonLd data={eventLd} /> : null}
      <JsonLd
        data={buildBreadcrumbLd([
          { name: '대회', path: '/tournaments' },
          { name: '정규 리그', path: '/tournaments?kind=league' },
          { name: league.title, path: `/tournaments/${encodeURIComponent(league.leagueId)}` },
          { name: title, path: fixturePath(league.leagueId, fixtureId) },
        ])}
      />
      <LeagueFixtureDetailClient
        leagueId={actualLeagueId}
        fixtureId={fixtureId}
        seedLeague={leagueDetail}
        seedStandings={standings}
        seedTeamMatch={detail}
      />
    </>
  );
}
