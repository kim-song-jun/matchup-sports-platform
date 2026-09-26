import { fetchPublicSiteInfo } from '@/lib/public-site/site-info';
import { AudiencePageView, audienceMetadata } from '../_audience/audience-page';

export const metadata = audienceMetadata('organizers');

export default async function ForOrganizersPage() {
  const siteInfo = await fetchPublicSiteInfo();
  return <AudiencePageView slug="organizers" siteInfo={siteInfo} />;
}
