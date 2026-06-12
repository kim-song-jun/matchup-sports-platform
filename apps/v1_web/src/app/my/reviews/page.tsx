import { ReviewsPageClient } from '@/components/reviews/reviews-api-clients';

type ReviewsPageProps = {
  // Next 16 App Router always passes searchParams as a Promise; the prior union violated PageProps.
  searchParams?: Promise<{ tab?: string }>;
};

export default async function ReviewsPage({ searchParams }: ReviewsPageProps) {
  const params = await searchParams;
  const tab = params?.tab === 'written' ? 'written' : params?.tab === 'received' ? 'received' : 'pending';
  return <ReviewsPageClient initialTab={tab} />;
}
