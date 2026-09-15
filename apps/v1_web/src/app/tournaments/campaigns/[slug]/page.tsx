import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TournamentCampaignTemplate } from '@/components/tournaments/tournament-campaign-template';
import { CampaignChromeBridge } from './campaign-chrome-bridge';
import { loadPublicTournamentCampaign } from './load-public-tournament-campaign';
import { buildNoIndexMetadata, buildPublicMetadata, metadataDescription } from '@/lib/seo';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const result = await loadPublicTournamentCampaign(slug);
  if (result.kind === 'not_found') return buildNoIndexMetadata('대회 캠페인을 찾을 수 없어요');

  return buildPublicMetadata({
    title: result.campaign.content.hero.title || result.campaign.tournament.title,
    description: metadataDescription(
      result.campaign.content.hero.summary || result.campaign.content.intro.body,
      `${result.campaign.tournament.title} 대회 캠페인을 확인해 보세요.`,
    ),
    path: `/tournaments/campaigns/${slug}`,
    image: result.campaign.content.hero.imageUrl || result.campaign.tournament.coverImageUrl,
  });
}

// route-chrome 테이블('/tournaments/campaigns/:slug', fragments/tournaments-core.ts)에
// 등록됐다. 이벤트 허브(`/events`)에서 `?from=events&sport=...`로 들어온 방문자는
// 뒤로가기가 이벤트 허브(+선택한 종목 필터)로 돌아가야 하는데(page.test.tsx "preserves
// a safe events filter in the campaign back link"가 이 계약을 박제한다), route-chrome의
// backHref는 라우트 파라미터 함수만 지원하고 검색 파라미터는 못 받는다 — 그래서 이
// 검색-파라미터 의존 backHref는 CampaignChromeBridge의 useShellOverride({ backHref })로
// 표현한다(ShellOverride.backHref, shell-override.ts). 테이블에 등록된 backHref는
// override가 없을 때만 쓰이는 정적 fallback이라 이 페이지에선(항상 override가 있으므로)
// 실질적으로 쓰이지 않는다 — not-found.tsx가 그 fallback을 실제로 사용한다.
export default async function TournamentCampaignPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly slug: string }>;
  readonly searchParams?: Promise<{
    readonly from?: string | string[];
    readonly sport?: string | string[];
  }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const from = typeof query?.from === 'string' ? query.from : null;
  const sport = typeof query?.sport === 'string' ? query.sport : null;
  const backHref =
    from === 'events'
      ? `/events${
          sport && /^[a-z0-9-]{1,40}$/i.test(sport)
            ? `?sport=${encodeURIComponent(sport)}`
            : ''
        }`
      : '/tournaments';
  const result = await loadPublicTournamentCampaign(slug);

  if (result.kind === 'not_found') notFound();

  return (
    <CampaignChromeBridge title={result.campaign.tournament.title} backHref={backHref}>
      <TournamentCampaignTemplate campaign={result.campaign} />
    </CampaignChromeBridge>
  );
}
