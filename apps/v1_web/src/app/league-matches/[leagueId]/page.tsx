import type { Metadata } from 'next';
import LeagueMatchStandingsClient from './league-match-standings-client';
import { JsonLd } from '@/components/seo/json-ld';
import { formatTournamentDateLong } from '@/lib/date-utils';
import { buildNoIndexMetadata, buildPublicMetadata } from '@/lib/seo';
import { buildBreadcrumbLd } from '@/lib/structured-data';
import { buildLeagueEventLd } from '@/lib/structured-data-competition';
import type { V1LeagueStandingsResponse, V1PublicLeagueDetail } from '@/types/league-match';
import { leaguePath, loadPublic } from './load-public';

interface Props {
  params: Promise<{ leagueId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { leagueId } = await params;
  const path = leaguePath(leagueId);
  const league = await loadPublic<V1PublicLeagueDetail>(path);
  if (!league.ok) {
    return buildPublicMetadata({ title: '정규 리그', description: '정규 리그 순위표와 경기 일정·결과를 확인해 보세요.', path });
  }
  if (!league.data) return buildNoIndexMetadata('리그를 찾을 수 없어요');

  const { title, tierLabel, startsOn, endsOn } = league.data;
  return buildPublicMetadata({
    title,
    description: `${tierLabel ? `${tierLabel} ` : ''}정규 리그 · ${formatTournamentDateLong(startsOn)} ~ ${formatTournamentDateLong(endsOn)}. 순위표와 경기 일정·결과를 확인해 보세요.`,
    path,
  });
}

// AppChrome 승격(U31) — 셸은 route-chrome 테이블(lib/route-chrome/fragments/
// league-matches.ts)이 정적으로 그린다. backHref는 리그 목록으로 고정돼 있어
// 딥링크로 바로 들어온 사용자도 목록으로 나갈 수 있다.
export default async function LeagueMatchPage({ params }: Props) {
  const { leagueId } = await params;
  const [league, standings] = await Promise.all([
    loadPublic<V1PublicLeagueDetail>(leaguePath(leagueId)),
    loadPublic<V1LeagueStandingsResponse>(`${leaguePath(leagueId)}/standings`),
  ]);
  const detail = league.ok ? league.data : null;

  return (
    <>
      {detail ? (
        <>
          <JsonLd data={buildLeagueEventLd(detail, standings.ok ? standings.data : null)} />
          <JsonLd
            data={buildBreadcrumbLd([
              { name: '대회', path: '/tournaments' },
              { name: '정규 리그', path: '/tournaments?kind=league' },
              { name: detail.title, path: leaguePath(leagueId) },
            ])}
          />
        </>
      ) : null}
      <LeagueMatchStandingsClient leagueId={leagueId} />
    </>
  );
}
