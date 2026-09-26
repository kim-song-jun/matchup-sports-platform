import { fetchPublicSiteInfo } from '@/lib/public-site/site-info';
import { AudiencePageView, audienceMetadata } from '../_audience/audience-page';

export const metadata = audienceMetadata('players');

export default async function ForPlayersPage() {
  const siteInfo = await fetchPublicSiteInfo();
  return <AudiencePageView slug="players" siteInfo={siteInfo} />;
}
