import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildNoIndexMetadata, buildPublicMetadata, fetchPublicV1 } from '@/lib/seo';
import TeamDetailPage, { generateMetadata } from './page';

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('@/lib/seo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/seo')>();
  return {
    ...actual,
    fetchPublicV1: vi.fn(),
    buildNoIndexMetadata: vi.fn(actual.buildNoIndexMetadata),
    buildPublicMetadata: vi.fn(actual.buildPublicMetadata),
  };
});

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

  it('커버 없이 로고만 있으면 정사각 이미지로 알려 큰 카드로 잘리지 않게 한다', async () => {
    const params = Promise.resolve({ id: 't1' });
    fetchPublicV1Mock.mockResolvedValue({ id: 't1', name: '성수 러너스', profile: { logoUrl: '/uploads/logo.png' } } as never);
    await generateMetadata({ params });
    expect(vi.mocked(buildPublicMetadata)).toHaveBeenLastCalledWith(
      expect.objectContaining({ image: '/uploads/logo.png', squareImage: true }),
    );

    fetchPublicV1Mock.mockResolvedValue({
      id: 't1',
      name: '성수 러너스',
      profile: { logoUrl: '/uploads/logo.png', coverImageUrl: '/uploads/cover.png' },
    } as never);
    await generateMetadata({ params });
    expect(vi.mocked(buildPublicMetadata)).toHaveBeenLastCalledWith(
      expect.objectContaining({ image: '/uploads/cover.png', squareImage: false }),
    );
  });

  it('공개 팀의 실제 종목·지역·활동·수준을 검색 메타에 전달하고 기존 canonical/image 흐름을 보존한다', async () => {
    const params = Promise.resolve({ id: 'team-1' });
    fetchPublicV1Mock.mockResolvedValue({
      teamId: 'team-1',
      name: '성수 러너스',
      sport: { sportId: 'running', name: '러닝' },
      region: { regionId: 'seongdong', name: '성동구', parentName: '서울' },
      status: 'active',
      visibility: 'public',
      profile: {
        introduction: '주말마다 성수에서 초보자와 함께 달려요',
        activitySummary: '주말 · 오전',
        levelLabel: '초급-중급',
        joinPolicy: 'approval_required',
        logoUrl: '/uploads/team.png',
        coverImageUrl: null,
      },
    } as never);

    const metadata = await generateMetadata({ params });

    expect(metadata.title).toBe('성수 러너스 · 러닝 · 서울 성동구 팀');
    expect(metadata.description).toContain('주말마다 성수에서 초보자와 함께 달려요');
    expect(metadata.description).toContain('서울 성동구');
    expect(metadata.description).toContain('러닝');
    expect(metadata.description).toContain('가입은 운영진 승인 방식이에요.');
    expect(metadata.alternates?.canonical).toBe('/teams/team-1');
    expect(metadata.robots).toMatchObject({ index: true, follow: true });
    expect(metadata.openGraph?.images).toContainEqual(expect.objectContaining({ url: '/uploads/team.png' }));
    expect(vi.mocked(buildPublicMetadata)).toHaveBeenCalledWith(expect.objectContaining({ image: '/uploads/team.png', squareImage: true }));
  });

  it('없는 팀과 해체 팀의 기존 noindex 경계를 유지한다', async () => {
    const params = Promise.resolve({ id: 'team-1' });
    fetchPublicV1Mock.mockResolvedValue(null as never);
    const missingMetadata = await generateMetadata({ params });
    expect(missingMetadata.robots).toMatchObject({ index: false, follow: false });
    expect(vi.mocked(buildNoIndexMetadata)).toHaveBeenLastCalledWith('팀을 찾을 수 없어요');

    fetchPublicV1Mock.mockResolvedValue({ name: '해체 팀', dissolution: { dissolvedAt: null } } as never);
    const dissolvedMetadata = await generateMetadata({ params });
    expect(dissolvedMetadata.robots).toMatchObject({ index: false, follow: false });
    expect(vi.mocked(buildNoIndexMetadata)).toHaveBeenLastCalledWith('해체 팀 (해체된 팀)');
    expect(vi.mocked(buildPublicMetadata)).not.toHaveBeenCalled();
  });

  it('없는 팀은 notFound 로 끝난다', async () => {
    fetchPublicV1Mock.mockResolvedValue(null as never);

    await expect(TeamDetailPage({ params: Promise.resolve({ id: 'nope' }) })).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
