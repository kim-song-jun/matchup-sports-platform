import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchPublicV1 } from '@/lib/seo';
import MatchDetailPage from './page';

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('@/lib/seo', () => ({
  fetchPublicV1: vi.fn(),
  buildNoIndexMetadata: vi.fn(),
  buildPublicMetadata: vi.fn(),
  metadataDescription: vi.fn(),
}));

vi.mock('@/components/matches/matches-client', () => ({
  MatchDetailPageClient: () => null,
}));

const fetchPublicV1Mock = vi.mocked(fetchPublicV1);

describe('MatchDetailPage (server)', () => {
  beforeEach(() => vi.clearAllMocks());

  // 존재 확인을 위해 어차피 기다린 응답이다. 넘기지 않으면 딥링크·푸시·새로고침 진입에서
  // 첫 화면이 다시 빈다 — `seed` 가 optional prop 이라 타입검사는 이 회귀를 못 잡는다.
  it('서버에서 받은 매치를 클라이언트에 seed 로 넘긴다', async () => {
    const match = { id: 'match-1', matchId: 'match-1', title: '주말 풋살' };
    fetchPublicV1Mock.mockResolvedValue(match as never);

    const element = await MatchDetailPage({ params: Promise.resolve({ id: 'match-1' }) });

    expect(element.props.matchId).toBe('match-1');
    expect(element.props.seed).toEqual(match);
  });

  it('없는 매치는 notFound 로 끝난다', async () => {
    fetchPublicV1Mock.mockResolvedValue(null as never);

    await expect(MatchDetailPage({ params: Promise.resolve({ id: 'nope' }) })).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
