import { ReviewSourcePageClient } from '@/components/reviews/reviews-api-clients';
import type { V1ReviewSourceType } from '@/types/api';

type ReviewSourceRouteProps = {
  // Next 16 App Router always passes params/searchParams as Promises; the prior unions violated PageProps.
  params: Promise<{ sourceType: string; sourceId: string }>;
  searchParams?: Promise<{ complete?: string }>;
};

export default async function ReviewSourceRoute({ params, searchParams }: ReviewSourceRouteProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const sourceType = parseReviewSourceType(resolvedParams.sourceType);

  return (
    <ReviewSourcePageClient
      complete={resolvedSearchParams?.complete === '1'}
      sourceId={resolvedParams.sourceId}
      sourceType={sourceType}
    />
  );
}

function parseReviewSourceType(sourceType: string): V1ReviewSourceType {
  switch (sourceType) {
    case 'team_match':
      return 'team_match';
    case 'tournament_fixture':
      return 'tournament_fixture';
    default:
      return 'match';
  }
}
