import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchPublicV1 } from '@/lib/seo';
import { redirect } from 'next/navigation';
import TeamMatchDetailPage from './page';

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    // 실제 next redirect 처럼 던져서 이후 렌더 코드가 실행되지 않음을 함께 검증한다.
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
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

vi.mock('@/components/team-matches/team-matches-client', () => ({
  TeamMatchDetailPageClient: () => null,
}));

const fetchPublicV1Mock = vi.mocked(fetchPublicV1);

describe('TeamMatchDetailPage (server)', () => {
  beforeEach(() => {
    // redirect spy 호출 기록이 테스트 간 이월되면 "리다이렉트 없음" 검증이 오염된다.
    vi.clearAllMocks();
  });

  // 리그 대진의 알림·목록 딥링크는 전부 /team-matches/:id 로 온다 — 이 리다이렉트가
  // 사라지면 리그 경기가 다시 "상대팀 모집" 프레임으로 뜬다(2026-08-25 사용자 보고).
  it('리그 대진이면 리그 경기 상세로 리다이렉트한다', async () => {
    fetchPublicV1Mock.mockResolvedValue({
      id: 'fx-1',
      league: { leagueId: 'lg-1', title: '가을 리그' },
    } as never);

    await expect(TeamMatchDetailPage({ params: Promise.resolve({ id: 'fx-1' }) })).rejects.toThrow(
      'NEXT_REDIRECT:/league-matches/lg-1/fixtures/fx-1',
    );
    expect(vi.mocked(redirect)).toHaveBeenCalledWith('/league-matches/lg-1/fixtures/fx-1');
  });

  it('리그 대진이 아니면 리다이렉트 없이 팀매치 상세를 렌더한다', async () => {
    fetchPublicV1Mock.mockResolvedValue({ id: 'tm-1', league: null } as never);

    await expect(TeamMatchDetailPage({ params: Promise.resolve({ id: 'tm-1' }) })).resolves.toBeTruthy();
    expect(vi.mocked(redirect)).not.toHaveBeenCalledWith(expect.stringContaining('/league-matches/'));
  });
});

describe('TeamMatchDetailPage (server) — 첫 표시값 전달', () => {
  beforeEach(() => vi.clearAllMocks());

  // 리다이렉트 판정을 위해 어차피 받은 응답이다. 넘기지 않으면 딥링크·푸시·새로고침
  // 진입에서 첫 화면이 다시 비게 된다(seed 는 optional prop 이라 타입검사도 못 잡는다).
  it('서버에서 받은 팀매치를 클라이언트에 seed 로 넘긴다', async () => {
    const teamMatch = { id: 'tm-1', teamMatchId: 'tm-1', title: '주말 팀매치', league: null };
    fetchPublicV1Mock.mockResolvedValue(teamMatch as never);

    const element = await TeamMatchDetailPage({ params: Promise.resolve({ id: 'tm-1' }) });

    expect(element.props.teamMatchId).toBe('tm-1');
    expect(element.props.seed).toEqual(teamMatch);
  });
});
