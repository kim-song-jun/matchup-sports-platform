import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicProfilePageClient } from './public-profile-client';
import { useV1AuthMe, useV1PublicProfile } from '@/hooks/use-v1-api';
import type { V1PublicProfile } from '@/types/api';

// D1(2026-09-25): 이 화면은 더 이상 useShellOverride로 backHref를 게시하지 않는다 —
// AppBackLink가 ?from=을 셸에서 직접 읽는다(app-back-link.tsx). 소속팀 칩은 이 화면이
// 받은 from까지 담은 자기 자신(useCurrentHref)을 출처로 이어 붙인다.
const navigation = vi.hoisted(() => ({ pathname: '/users/user-1', search: '' }));
vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1PublicProfile: vi.fn(),
  useV1AuthMe: vi.fn(),
}));

const useV1PublicProfileMock = vi.mocked(useV1PublicProfile);
const useV1AuthMeMock = vi.mocked(useV1AuthMe);

function profile(overrides: Partial<V1PublicProfile> = {}): V1PublicProfile {
  return {
    userId: 'user-2',
    displayName: '성수 FC 스트라이커',
    nickname: '스트라이커',
    profileImageUrl: null,
    bio: null,
    teams: [{ id: 'team-9', name: '성수 FC' }],
    recentActivity: null,
    reputation: { trustState: 'estimated', mannerScore: null, activityCount: 3, reviewCount: 0, highlight: null },
    playerCard: null,
    activitySummary: null,
    ...overrides,
  };
}

describe('PublicProfilePageClient — 소속팀 칩 출처', () => {
  beforeEach(() => {
    navigation.pathname = '/users/user-1';
    navigation.search = '';
    useV1AuthMeMock.mockReturnValue({ data: undefined } as never);
  });

  it('받은 from 이 없으면 이 화면 자기 경로만을 출처로 담는다', () => {
    useV1PublicProfileMock.mockReturnValue({ isLoading: false, isError: false, data: profile() } as never);

    render(<PublicProfilePageClient userId="user-1" />);

    expect(screen.getByRole('link', { name: '성수 FC' })).toHaveAttribute(
      'href',
      `/teams/team-9?from=${encodeURIComponent('/users/user-1')}`,
    );
  });

  it('받은 from 을 소속팀 칩에도 이어 붙인다', () => {
    navigation.search = 'from=%2Fmatches%2Fm-1';
    useV1PublicProfileMock.mockReturnValue({ isLoading: false, isError: false, data: profile() } as never);

    render(<PublicProfilePageClient userId="user-1" />);

    const selfHref = `/users/user-1?from=${encodeURIComponent('/matches/m-1')}`;
    expect(screen.getByRole('link', { name: '성수 FC' })).toHaveAttribute(
      'href',
      `/teams/team-9?from=${encodeURIComponent(selfHref)}`,
    );
  });

  it('소속팀이 없으면 칩 자체가 없다', () => {
    useV1PublicProfileMock.mockReturnValue({ isLoading: false, isError: false, data: profile({ teams: [] }) } as never);

    render(<PublicProfilePageClient userId="user-1" />);

    expect(screen.queryByText('소속팀')).not.toBeInTheDocument();
  });
});

describe('PublicProfilePageClient — 카드 공유 링크 출처', () => {
  const playerCard = {
    formulaVersion: 1, position: 'GK', jerseyNumber: 1, overall: 48, tier: 'bronze', shape: 'rect', appearances: 4,
    stats: [
      { code: 'SHO', label: '골', value: 44, unlocked: true, lockedBy: null },
      { code: 'PAS', label: '도움', value: 30, unlocked: true, lockedBy: null },
      { code: 'APP', label: '출전', value: 59, unlocked: true, lockedBy: null },
      { code: 'SKI', label: '실력', value: null, unlocked: false, lockedBy: { type: 'reviews', remaining: 3 } },
      { code: 'MAN', label: '매너', value: null, unlocked: false, lockedBy: { type: 'reviews', remaining: 3 } },
      { code: 'PUN', label: '시간약속', value: null, unlocked: false, lockedBy: { type: 'reviews', remaining: 3 } },
    ],
    unlockedCount: 3, nextUnlock: { code: 'SKI', reason: { type: 'reviews', remaining: 3 } },
  } as unknown as V1PublicProfile['playerCard'];

  beforeEach(() => {
    navigation.pathname = '/users/user-1';
    useV1AuthMeMock.mockReturnValue({ data: undefined } as never);
  });

  // 프로필 → 카드 → 뒤로 → 프로필 → 뒤로 가 처음 화면에 닿으려면 카드 링크에 프로필이 받은 출처까지 실려야 한다.
  it('프로필이 받은 from 까지 카드 링크에 이어 붙인다', () => {
    navigation.search = 'from=%2Fmatches%2Fm-1';
    useV1PublicProfileMock.mockReturnValue({ isLoading: false, isError: false, data: profile({ playerCard }) } as never);

    render(<PublicProfilePageClient userId="user-1" />);

    const selfHref = `/users/user-1?from=${encodeURIComponent('/matches/m-1')}`;
    expect(screen.getByRole('link', { name: '카드 공유하기' })).toHaveAttribute(
      'href',
      `/users/user-1/card?from=${encodeURIComponent(selfHref)}`,
    );
  });
});

describe('PublicProfilePageClient — 받은 후기 요약 · 활동 카드', () => {
  beforeEach(() => {
    navigation.pathname = '/users/user-1';
    navigation.search = '';
    useV1AuthMeMock.mockReturnValue({ data: undefined } as never);
  });

  const activitySummary = {
    totals: { matchCount: 4, tournamentCount: 2, teamCount: 3, reviewCount: 5 },
    monthly: { matchCount: 1, tournamentCount: 1, teamJoinCount: 1, reviewCount: 0 },
  } as V1PublicProfile['activitySummary'];

  it('공개 후기의 대표 태그가 있으면 신뢰 신호 카드에 한 문장으로 보이고, 없으면 문장이 없다', () => {
    const highlight = { tagCode: 'manner', label: '매너가 좋아요', rate: 0.68, reviewCount: 12 };
    useV1PublicProfileMock.mockReturnValue({
      isLoading: false, isError: false,
      data: profile({ reputation: { trustState: 'verified', mannerScore: 4.6, activityCount: 12, reviewCount: 12, highlight } }),
    } as never);
    const { unmount } = render(<PublicProfilePageClient userId="user-1" />);
    expect(screen.getByText(/가장 많이 꼽았어요/).closest('p')).toHaveTextContent('함께 뛴 사람들이 ‘매너가 좋아요’를 가장 많이 꼽았어요 (68%)');
    unmount();

    useV1PublicProfileMock.mockReturnValue({ isLoading: false, isError: false, data: profile() } as never);
    render(<PublicProfilePageClient userId="user-1" />);
    expect(screen.queryByText(/가장 많이 꼽았어요/)).not.toBeInTheDocument();
  });

  it('활동은 한 카드에서 전체와 이번 달을 탭으로 바꿔 본다 — 이번 달의 세 번째 칸은 팀 가입', async () => {
    useV1PublicProfileMock.mockReturnValue({ isLoading: false, isError: false, data: profile({ activitySummary }) } as never);
    render(<PublicProfilePageClient userId="user-1" />);

    expect(screen.getByLabelText('팀 3개')).toBeInTheDocument();
    expect(screen.queryByText('이번 달 활동')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: '이번 달' }));
    expect(screen.getByLabelText('팀 가입 1회')).toBeInTheDocument();
    expect(screen.queryByLabelText('팀 3개')).not.toBeInTheDocument();
  });

  it('최근 경기와 기록 전체 보기가 활동 카드 안에 있고, 기록 링크는 이 프로필을 출처로 싣는다', () => {
    navigation.search = 'from=%2Fteams%2Fteam-9';
    useV1PublicProfileMock.mockReturnValue({
      isLoading: false, isError: false,
      data: profile({ activitySummary, recentActivity: { teamName: '성수 FC', jerseyNumber: 7, position: null, playedAt: '2026-09-17T10:00:00.000Z' } as V1PublicProfile['recentActivity'] }),
    } as never);
    render(<PublicProfilePageClient userId="user-1" />);

    const link = screen.getByRole('link', { name: /활동 기록 전체 보기/ });
    const card = link.closest('.tm-card');
    expect(card).toHaveTextContent('최근 경기');
    expect(card).toHaveTextContent('성수 FC · 7번');
    const selfHref = `/users/user-1?from=${encodeURIComponent('/teams/team-9')}`;
    expect(link).toHaveAttribute('href', `/users/user-1/records?from=${encodeURIComponent(selfHref)}`);
  });
});
