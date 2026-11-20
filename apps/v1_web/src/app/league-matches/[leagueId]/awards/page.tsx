import type { Metadata } from 'next';
import { buildNoIndexMetadata, buildPublicMetadata } from '@/lib/seo';
import type { V1PublicLeagueDetail } from '@/types/league-match';
import { leaguePath, loadPublic } from '../load-public';
import { LeagueAwardsPageClient } from './league-awards-page-client';

interface Props {
  params: Promise<{ leagueId: string }>;
}

const SEARCH_EXCLUDED = { index: false, follow: true } as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { leagueId } = await params;
  const path = `${leaguePath(leagueId)}/awards`;
  const league = await loadPublic<V1PublicLeagueDetail>(leaguePath(leagueId));
  // 조회 실패면 끝난 리그인지 알 수 없다 — 색인을 허용하지 않는다.
  if (!league.ok) {
    const metadata = buildPublicMetadata({ title: '리그 시상 결과', description: '정규 리그의 우승팀과 최종 순위를 확인해 보세요.', path });
    return { ...metadata, robots: SEARCH_EXCLUDED };
  }
  if (!league.data) return buildNoIndexMetadata('리그를 찾을 수 없어요');

  const { title, state } = league.data;
  const metadata = buildPublicMetadata({
    title: `${title} 시상 결과`,
    description: `${title}의 우승팀과 최종 순위, 개인 기록 시상을 확인해 보세요.`,
    path,
  });
  return state === 'completed' ? metadata : { ...metadata, robots: SEARCH_EXCLUDED };
}

// AppChrome 승격(U31) — 셸은 route-chrome 테이블(lib/route-chrome/fragments/
// league-matches.ts)이 정적으로 그린다. backHref로 리그 상세를 명시한다(딥링크로
// 바로 들어온 사용자도 시즌 결산 화면 밖으로 나갈 길이 있어야 한다). 없는 리그도
// notFound()로 미리 막지 않는다 — 응답은 200이고 메타만 검색 제외다. 잘못된 leagueId는
// 클라이언트가 seriesQuery.isError 분기에서 ErrorState+재시도로 처리한다.
export default async function LeagueAwardsPage({ params }: Props) {
  const { leagueId } = await params;
  return <LeagueAwardsPageClient leagueId={leagueId} />;
}
