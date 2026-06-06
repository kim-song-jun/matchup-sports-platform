import { ReviewsPageClient } from '@/components/reviews/reviews-api-clients';

type ReviewsPageProps = {
  searchParams?: Promise<{ tab?: string }>;
};

export default async function ReviewsPage({ searchParams }: ReviewsPageProps) {
  const params = await searchParams;
  const tab = params?.tab === 'written' ? 'written' : params?.tab === 'received' ? 'received' : 'pending';
  return <ReviewsPageClient initialTab={tab} />;
}
