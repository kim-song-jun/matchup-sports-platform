import { SearchExperience } from '@/components/search/search-experience';

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const params = await searchParams;
  const q = Array.isArray(params.q) ? params.q[0] ?? '' : params.q ?? '';
  return <SearchExperience initialQuery={q} />;
}
