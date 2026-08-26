import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MatchPageClient } from './match-page-client';

/**
 * 라인업 관리 진입점의 계약.
 *
 * 대회 스태프는 `mySideId` 가 null 이지만 라인업 화면에서 팀을 골라 양 팀 명단을
 * 작성할 수 있다(스태프 팀 선택 UI). 예전에는 이 CTA 가 `mySideId` 만 보고 걸러서
 * "권한은 있는데 들어갈 링크가 없는" 상태였고, URL 을 직접 아는 사람만 진입할 수
 * 있었다. 이 테스트가 깨지면 그 상태로 되돌아간 것이다.
 */
const accessMock = vi.fn();
const matchMock = vi.fn();
const chromeMock = vi.fn(({ children }: { children: React.ReactNode }) => <div>{children}</div>);

vi.mock('@/hooks/use-v1-api', () => ({
  useV1FixtureLineupAccess: (...args: unknown[]) => accessMock(...args),
  // Task 154 P0-5: 같은 화면에 "이 기록은 제 것입니다" 섹션이 붙으면서 이 훅들도 탄다.
  // 이 스펙의 관심사는 라인업 CTA 노출 규칙이므로, 목록 조회는 비활성(모달 닫힘) 상태로
  // 고정한다 -- 섹션 자체의 계약은 별도 스펙이 맡는다.
  useV1ClaimableParticipants: () => ({ data: undefined, isLoading: false, isError: false, error: null }),
  useV1RequestIdentityLink: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/components/public-game-records/use-public-game-records', () => ({
  usePublicMatch: (...args: unknown[]) => matchMock(...args),
}));

// 승인함 내부(훅·버튼)는 attest-requests.test.tsx 가 검증한다 — 이 스펙의 관심사(라인업
// CTA 노출 규칙)와 무관하고, 실컴포넌트를 두면 use-v1-api mock factory 에 훅 3개를
// 계속 따라 붙여야 한다.
vi.mock('@/components/public-game-records/attest-requests', () => ({
  AttestRequestsSection: () => null,
}));

vi.mock('@/components/public-game-records/match-detail-content', () => ({
  MatchDetailContent: () => <div>경기 상세</div>,
}));

// 앱 셸은 알림 배지 등 이 테스트와 무관한 훅을 끌고 온다 — 관심사는 CTA 노출 조건뿐이다.
vi.mock('@/components/v1-ui/shell', () => ({
  AppChrome: (props: { children: React.ReactNode }) => chromeMock(props),
}));

function renderWith(access: { mySideId: string | null; isStaff: boolean } | undefined) {
  matchMock.mockReturnValue({
    data: { fixture: { id: 'f-1' } },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  });
  accessMock.mockReturnValue({ data: access });
  return render(<MatchPageClient tournamentId="t-1" fixtureId="f-1" />);
}

describe('MatchPageClient — 라인업 관리 진입점', () => {
  beforeEach(() => {
    accessMock.mockReset();
    matchMock.mockReset();
    chromeMock.mockClear();
  });

  it('참가팀 매니저에게 라인업 관리 링크를 보여준다', () => {
    renderWith({ mySideId: 'side-home', isStaff: false });

    const link = screen.getByRole('link', { name: '라인업 관리' });
    expect(link).toHaveAttribute('href', '/tournaments/t-1/matches/f-1/lineup');
    expect(screen.getByText('선발·후보 명단을 작성하고 제출하세요.')).toBeInTheDocument();
  });

  it('소속 팀이 없는 대회 스태프에게도 링크를 보여준다', () => {
    renderWith({ mySideId: null, isStaff: true });

    expect(screen.getByRole('link', { name: '라인업 관리' })).toHaveAttribute(
      'href',
      '/tournaments/t-1/matches/f-1/lineup',
    );
    expect(screen.getByText('운영진 권한으로 양 팀 명단을 작성할 수 있어요.')).toBeInTheDocument();
  });

  it('권한이 없는 일반 관람자에게는 링크를 감춘다', () => {
    renderWith({ mySideId: null, isStaff: false });

    expect(screen.queryByRole('link', { name: '라인업 관리' })).not.toBeInTheDocument();
  });

  it('접근 권한을 아직 못 받았으면 링크를 감춘다', () => {
    renderWith(undefined);

    expect(screen.queryByRole('link', { name: '라인업 관리' })).not.toBeInTheDocument();
  });

  it('경기 상세의 뒤로가기는 통합 일정 화면인 bracket으로 돌아간다', () => {
    renderWith({ mySideId: 'side-home', isStaff: false });

    expect(chromeMock).toHaveBeenCalledWith(
      expect.objectContaining({ backHref: '/tournaments/t-1/bracket' }),
    );
  });
});
