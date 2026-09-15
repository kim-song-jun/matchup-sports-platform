import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchPublicV1 } from '@/lib/seo';
import TeamDetailPage from './page';

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
  teamDescriptionFallback: vi.fn(),
}));

vi.mock('@/lib/structured-data', () => ({
  buildSportsTeamLd: vi.fn(() => ({})),
  buildBreadcrumbLd: vi.fn(() => ({})),
  displayRegionName: vi.fn(() => '서울 성동구'),
}));

vi.mock('@/components/seo/json-ld', () => ({ JsonLd: () => null }));
vi.mock('@/components/teams/teams-client', () => ({ TeamDetailPageClient: () => null }));

const fetchPublicV1Mock = vi.mocked(fetchPublicV1);

/** 반환 트리에서 TeamDetailPageClient 엘리먼트를 찾아 props 를 본다. */
function findClientProps(node: unknown): Record<string, unknown> | undefined {
  if (!node || typeof node !== 'object') return undefined;
  const el = node as { props?: Record<string, unknown> };
  if (el.props && 'teamId' in el.props) return el.props;
  const children = el.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = findClientProps(child);
    if (found) return found;
  }
  return undefined;
}

describe('TeamDetailPage (server)', () => {
  beforeEach(() => vi.clearAllMocks());

  // 구조화 데이터가 쓰려고 어차피 받은 응답이다. 넘기지 않으면 딥링크·푸시·새로고침 진입에서
  // 첫 화면이 다시 빈다 — `seed` 가 optional prop 이라 타입검사는 이 회귀를 못 잡는다.
  it('서버에서 받은 팀 상세를 클라이언트에 seed 로 넘긴다', async () => {
    const team = { id: 't1', teamId: 't1', name: '성수 러너스', profile: {} };
    fetchPublicV1Mock.mockResolvedValue(team as never);

    const props = findClientProps(await TeamDetailPage({ params: Promise.resolve({ id: 't1' }) }));

    expect(props?.teamId).toBe('t1');
    expect(props?.seed).toEqual(team);
  });

  it('없는 팀은 notFound 로 끝난다', async () => {
    fetchPublicV1Mock.mockResolvedValue(null as never);

    await expect(TeamDetailPage({ params: Promise.resolve({ id: 'nope' }) })).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
