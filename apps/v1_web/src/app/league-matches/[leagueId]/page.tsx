import type { Metadata } from 'next';
import LeagueMatchStandingsClient from './league-match-standings-client';
import { JsonLd } from '@/components/seo/json-ld';
import { formatTournamentDateLong } from '@/lib/date-utils';
import { buildNoIndexMetadata, buildPublicMetadata, fetchPublicV1 } from '@/lib/seo';
import { buildBreadcrumbLd } from '@/lib/structured-data';
import { buildLeagueEventLd } from '@/lib/structured-data-competition';
import type { V1LeagueStandingsResponse, V1PublicLeagueDetail } from '@/types/league-match';

interface Props {
  params: Promise<{ leagueId: string }>;
}

type Loaded<T> = { ok: true; data: T | null } | { ok: false };

// 이 화면은 원래 클라이언트만 API 를 불렀다 — 서버 조회가 실패했다고 페이지를 500 으로 만들지
// 않는다. 실패는 로그로 남기고 메타·LD 만 포기한다(404 는 proxy.ts 가 HTTP 상태로 처리한다).
async function load<T>(path: string): Promise<Loaded<T>> {
  try {
    return { ok: true, data: await fetchPublicV1<T>(path) };
  } catch (error) {
    console.error(`[seo] 리그 상세 서버 조회 실패 — ${path}`, error);
    return { ok: false };
  }
}

// 웹 경로와 API 경로가 같은 모양이라 canonical·breadcrumb·조회가 한 값을 쓴다.
const leaguePath = (leagueId: string) => `/league-matches/${encodeURIComponent(leagueId)}`;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { leagueId } = await params;
  const path = leaguePath(leagueId);
  const league = await load<V1PublicLeagueDetail>(path);
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
    load<V1PublicLeagueDetail>(leaguePath(leagueId)),
    load<V1LeagueStandingsResponse>(`${leaguePath(leagueId)}/standings`),
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
