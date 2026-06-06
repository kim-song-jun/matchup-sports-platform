import { ReviewSourcePageClient } from '@/components/reviews/reviews-api-clients';
import type { V1ReviewSourceType } from '@/types/api';

type ReviewSourceRouteProps = {
  params: Promise<{ sourceType: string; sourceId: string }>;
  searchParams?: Promise<{ complete?: string }>;
};

export default async function ReviewSourceRoute({ params, searchParams }: ReviewSourceRouteProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const sourceType = resolvedParams.sourceType === 'team_match' ? 'team_match' : 'match';

  return (
    <ReviewSourcePageClient
      complete={resolvedSearchParams?.complete === '1'}
      sourceId={resolvedParams.sourceId}
      sourceType={sourceType as V1ReviewSourceType}
    />
  );
}
