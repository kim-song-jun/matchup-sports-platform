import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import LeagueFixtureDetailClient from './league-fixture-detail-client';
import { JsonLd } from '@/components/seo/json-ld';
import { formatTournamentDateTimeLong } from '@/lib/date-utils';
import { leagueFixtureWeekNumber, withDerivedWeek } from '@/lib/league-fixture-week';
import { buildNoIndexMetadata, buildPublicMetadata } from '@/lib/seo';
import { buildBreadcrumbLd, buildTeamMatchEventLd } from '@/lib/structured-data';
import type { V1TeamMatch } from '@/types/api';
import type { V1PublicLeagueDetail } from '@/types/league-match';
import { leaguePath, loadPublic } from '../../load-public';

interface Props {
  params: Promise<{ leagueId: string; fixtureId: string }>;
}

// 리그 대진은 팀 매치 행이다 — 화면(클라이언트)도 같은 `/team-matches/:id` 를 읽는다.
const fixtureApiPath = (fixtureId: string) => `/team-matches/${encodeURIComponent(fixtureId)}`;
const fixturePath = (leagueId: string, fixtureId: string) =>
  `${leaguePath(leagueId)}/fixtures/${encodeURIComponent(fixtureId)}`;

// 저장된 대진 제목의 주차는 생성 시점 값이다 — 본문 주차와 같도록 일정에서 파생한 값으로 바꾼다.
// 리그 조회가 실패하면 저장된 제목을 그대로 쓴다(제목은 메타·LD 용이라 화면 오류가 아니다).
async function resolveFixtureTitle(fixture: V1TeamMatch, fixtureId: string): Promise<string> {
  if (!fixture.league) return fixture.title;
  const league = await loadPublic<V1PublicLeagueDetail>(leaguePath(fixture.league.leagueId));
  if (!league.ok || !league.data) return fixture.title;
  const { fixtures } = league.data;
  const target = fixtures.find((item) => item.teamMatchId === fixtureId);
  return target ? withDerivedWeek(fixture.title, leagueFixtureWeekNumber(fixtures, target)) : fixture.title;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { leagueId, fixtureId } = await params;
  const path = fixturePath(leagueId, fixtureId);
  const fixture = await loadPublic<V1TeamMatch>(fixtureApiPath(fixtureId));
  if (!fixture.ok) {
    return buildPublicMetadata({ title: '리그 경기', description: '정규 리그 경기의 일정과 결과를 확인해 보세요.', path });
  }
  if (!fixture.data) return buildNoIndexMetadata('경기를 찾을 수 없어요');

  const { league, startsAt, place } = fixture.data;
  const title = await resolveFixtureTitle(fixture.data, fixtureId);
  // 주소의 leagueId 가 틀려도(깨진 링크) canonical 은 경기가 실제로 속한 리그를 가리킨다.
  const canonical = league ? fixturePath(league.leagueId, fixtureId) : path;
  const parts = [league?.title ?? '정규 리그', formatTournamentDateTimeLong(startsAt), place?.name].filter(Boolean);
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
  const { leagueId, fixtureId } = await params;
  const fixture = await loadPublic<V1TeamMatch>(fixtureApiPath(fixtureId));
  // 이 경로는 proxy.ts matcher 밖이라 없는 경기의 HTTP 404 를 여기서 낸다(조회 실패는 404 가 아니다).
  if (fixture.ok && !fixture.data) notFound();
  const detail = fixture.ok ? fixture.data : null;
  // LD 는 주소가 아니라 경기가 실제로 속한 리그로 잇는다 — 리그가 아닌 경기면 리그 연결을 만들지 않는다.
  const league = detail?.league ?? null;
  const title = detail ? await resolveFixtureTitle(detail, fixtureId) : '';
  const eventLd = detail
    ? buildTeamMatchEventLd({ ...detail, title }, fixtureId, league
        ? { path: fixturePath(league.leagueId, fixtureId), superEventPath: leaguePath(league.leagueId) }
        : { path: fixturePath(leagueId, fixtureId) })
    : null;

  return (
    <>
      {eventLd ? <JsonLd data={eventLd} /> : null}
      {detail && league ? (
        <JsonLd
          data={buildBreadcrumbLd([
            { name: '대회', path: '/tournaments' },
            { name: '정규 리그', path: '/tournaments?kind=league' },
            { name: league.title, path: leaguePath(league.leagueId) },
            { name: title, path: fixturePath(league.leagueId, fixtureId) },
          ])}
        />
      ) : null}
      <LeagueFixtureDetailClient leagueId={leagueId} fixtureId={fixtureId} />
    </>
  );
}
