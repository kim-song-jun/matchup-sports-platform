import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TournamentCampaignTemplate } from '@/components/tournaments/tournament-campaign-template';
import { AppChrome } from '@/components/v1-ui/shell';
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
    <AppChrome
      title={result.campaign.tournament.title}
      activeTab="tournaments"
      backHref={backHref}
      showNotifications={false}
    >
      <TournamentCampaignTemplate campaign={result.campaign} />
    </AppChrome>
  );
}
