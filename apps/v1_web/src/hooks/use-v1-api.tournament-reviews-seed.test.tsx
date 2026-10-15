import { IsRestoringProvider, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { useV1TournamentReviews } from './use-v1-api';
import type { V1TournamentReviewsPage } from '@/types/api';

const seed: V1TournamentReviewsPage = {
  items: [{ id: 'review', authorId: 'user', authorNickname: '참가팀', authorProfileImageUrl: null, teamName: null,
    rating: 5, comment: '첫 페이지의 실제 후기', photoUrls: [], createdAt: '2026-10-01T00:00:00Z' }],
  page: 1, pageSize: 10, total: 20,
};

function Probe({ page, pageSize, search }: { page: number; pageSize: number; search: string }) {
  const { data } = useV1TournamentReviews('cup', { page, pageSize, search }, { seed });
  return <p>{data?.items[0]?.comment ?? '조회 전'}</p>;
}

describe('공개 후기 첫 HTML seed의 조회 범위', () => {
  it.each([
    [1, 10, '', true],
    [2, 10, '', false],
    [1, 20, '', false],
    [1, 10, '다른 팀', false],
  ] as const)('page=%s size=%s search=%s에 맞는 첫 페이지만 seed로 그린다', (page, pageSize, search, seeded) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    try {
      const html = renderToString(
        <QueryClientProvider client={client}><IsRestoringProvider value>
          <Probe page={page} pageSize={pageSize} search={search} />
        </IsRestoringProvider></QueryClientProvider>,
      );
      expect(html.includes('첫 페이지의 실제 후기')).toBe(seeded);
      expect(html.includes('조회 전')).toBe(!seeded);
    } finally {
      client.clear();
    }
  });
});
