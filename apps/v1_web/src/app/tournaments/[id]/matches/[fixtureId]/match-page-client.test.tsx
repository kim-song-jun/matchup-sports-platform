import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MatchPageClient } from './match-page-client';

/**
 * [P1-d] 이 파일에는 원래 **라인업 관리 CTA** 의 노출 규칙(참가팀 매니저·스태프에게
 * 보이고 관람자에게는 숨긴다)을 지키는 테스트 4건이 있었다. 경기별 라인업 화면이
 * 통째로 사라지면서 그 CTA 도 없어졌으므로 함께 걷어냈다 — 지금 팀장이 자리를 잡는
 * 곳은 팀 상세의 전술보드다.
 *
 * 남긴 것은 **화면 제거와 무관한 계약** 하나뿐이다(뒤로가기 목적지). 파일을 통째로
 * 지웠다면 그것까지 같이 사라졌을 것이다.
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

describe('MatchPageClient', () => {
  beforeEach(() => {
    accessMock.mockReset();
    matchMock.mockReset();
    chromeMock.mockClear();
  });

  it('경기 상세의 뒤로가기는 통합 일정 화면인 bracket으로 돌아간다', () => {
    renderWith({ mySideId: 'side-home', isStaff: false });

    expect(chromeMock).toHaveBeenCalledWith(
      expect.objectContaining({ backHref: '/tournaments/t-1/bracket' }),
    );
  });
});
