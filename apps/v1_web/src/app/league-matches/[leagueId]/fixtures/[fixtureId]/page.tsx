import type { Metadata } from 'next';
import LeagueFixtureDetailClient from './league-fixture-detail-client';
import { JsonLd } from '@/components/seo/json-ld';
import { formatTournamentDateTimeLong } from '@/lib/date-utils';
import { buildNoIndexMetadata, buildPublicMetadata } from '@/lib/seo';
import { buildBreadcrumbLd, buildTeamMatchEventLd } from '@/lib/structured-data';
import type { V1TeamMatch } from '@/types/api';
import { leaguePath, loadPublic } from '../../load-public';

interface Props {
  params: Promise<{ leagueId: string; fixtureId: string }>;
}

// 리그 대진은 팀 매치 행이다 — 화면(클라이언트)도 같은 `/team-matches/:id` 를 읽는다.
const fixtureApiPath = (fixtureId: string) => `/team-matches/${encodeURIComponent(fixtureId)}`;
const fixturePath = (leagueId: string, fixtureId: string) =>
  `${leaguePath(leagueId)}/fixtures/${encodeURIComponent(fixtureId)}`;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { leagueId, fixtureId } = await params;
  const path = fixturePath(leagueId, fixtureId);
  const fixture = await loadPublic<V1TeamMatch>(fixtureApiPath(fixtureId));
  if (!fixture.ok) {
    return buildPublicMetadata({ title: '리그 경기', description: '정규 리그 경기의 일정과 결과를 확인해 보세요.', path });
  }
  if (!fixture.data) return buildNoIndexMetadata('경기를 찾을 수 없어요');

  const { title, league, startsAt, place } = fixture.data;
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
  const detail = fixture.ok ? fixture.data : null;
  // LD 는 주소가 아니라 경기가 실제로 속한 리그로 잇는다 — 리그가 아닌 경기면 리그 연결을 만들지 않는다.
  const league = detail?.league ?? null;
  const eventLd = detail
    ? buildTeamMatchEventLd(detail, fixtureId, league
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
            { name: detail.title, path: fixturePath(league.leagueId, fixtureId) },
          ])}
        />
      ) : null}
      <LeagueFixtureDetailClient leagueId={leagueId} fixtureId={fixtureId} />
    </>
  );
}
