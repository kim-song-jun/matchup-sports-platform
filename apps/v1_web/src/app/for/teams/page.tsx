import { fetchPublicSiteInfo } from '@/lib/public-site/site-info';
import { AudiencePageView, audienceMetadata } from '../_audience/audience-page';

export const metadata = audienceMetadata('teams');

export default async function ForTeamsPage() {
  const siteInfo = await fetchPublicSiteInfo();
  return <AudiencePageView slug="teams" siteInfo={siteInfo} />;
}
