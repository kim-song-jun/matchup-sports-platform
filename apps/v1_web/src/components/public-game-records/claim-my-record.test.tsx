import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ClaimMyRecordSection, LeagueClaimMyRecordSection } from './claim-my-record';

/**
 * alpha 실화면(2026-08-24)에서 잡은 결함을 고정한다.
 *
 * 연결 가능한 참가자가 0명인데 "이 선수가 저예요" 버튼이 그대로 남아 있었다.
 * disabled 라도 회색 버튼이 보이면 "누를 수 있을 것 같은" 신호를 주고, 사용자는 왜
 * 안 눌리는지 찾게 된다. 아무것도 할 수 없는 상태에서는 그 버튼을 렌더하지 않는다.
 *
 * 유닛 테스트로는 안 잡혔던 종류다 -- 로직은 맞았고(버튼이 disabled 였다) 화면에서만
 * 잘못 읽혔다.
 */
const claimableMock = vi.fn();
const leagueClaimableMock = vi.fn();
vi.mock('@/hooks/use-v1-api', () => ({
  useV1ClaimableParticipants: (...args: unknown[]) => claimableMock(...args),
  useV1RequestIdentityLink: () => ({ mutate: vi.fn(), isPending: false }),
  useV1LeagueClaimableParticipants: (...args: unknown[]) => leagueClaimableMock(...args),
  useV1LeagueRequestIdentityLink: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/components/v1-ui/primitives', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

function openModal() {
  render(<ClaimMyRecordSection tournamentId="t-1" fixtureId="f-1" />);
  fireEvent.click(screen.getByRole('button', { name: '명단에서 나 찾기' }));
}

describe('ClaimMyRecordSection 빈 상태', () => {
  it('연결 가능한 참가자가 없으면 확정 버튼을 렌더하지 않는다', () => {
    claimableMock.mockReturnValue({
      data: { gameId: 'g-1', version: 3, participants: [] },
      isLoading: false,
      isError: false,
      error: null,
    });

    openModal();

    // 제목이 상태를 따라가야 한다. 고를 게 없는 화면이 "골라 주세요"라고 말하면
    // 사용자는 자기가 뭘 잘못했는지 찾게 된다(alpha 실화면에서 그렇게 읽혔다).
    expect(screen.getByText('연결할 참가자가 없어요')).toBeInTheDocument();
    expect(screen.queryByText('명단에서 본인을 골라 주세요')).not.toBeInTheDocument();
    // 막다른 안내로 끝내지 않고 진짜 남은 원인(공개 동의)으로 이어 준다.
    expect(screen.getByRole('link', { name: '기록 공개 설정' })).toHaveAttribute(
      'href',
      '/my/settings/record-consent',
    );
    expect(screen.queryByRole('button', { name: '이 선수가 저예요' })).not.toBeInTheDocument();
    // 할 수 있는 게 닫기뿐이므로 "취소"가 아니라 "닫기"로 말한다.
    expect(screen.getByRole('button', { name: '닫기' })).toBeInTheDocument();
  });

  it('고를 참가자가 있으면 확정 버튼을 보여준다', () => {
    claimableMock.mockReturnValue({
      data: {
        gameId: 'g-1',
        version: 3,
        participants: [{ participantId: 'p-1', sideId: 's-1', displayName: '홍길동', jerseyNumber: 7 }],
      },
      isLoading: false,
      isError: false,
      error: null,
    });

    openModal();

    expect(screen.getByRole('button', { name: /홍길동/ })).toBeInTheDocument();
    // 고를 게 있을 때는 원래 제목 그대로여야 한다 -- 빈 상태 문구가 새어 나오면 안 된다.
    expect(screen.getByText('명단에서 본인을 골라 주세요')).toBeInTheDocument();
    expect(screen.queryByText('연결할 참가자가 없어요')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '이 선수가 저예요' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '취소' })).toBeInTheDocument();
  });
});

// 2026-08-25 대회 패리티 후속 — 리그 래퍼는 같은 본문(View)을 쓰되 목록만 리그 스코프
// 훅을 태워야 한다. 여기가 어긋나면(예: 대회 훅을 그대로 부르면) 리그 화면이 대회
// fixture id 로 목록을 조회해 조용히 403/404 가 된다.
describe('LeagueClaimMyRecordSection', () => {
  it('리그 스코프 훅을 리그 인자로 부르고, 모달을 연 뒤에만 목록을 조회한다', () => {
    // 앞 describe 가 대회 훅을 호출했어도 이 테스트의 "대회 훅으로 새지 않는다" 단언이
    // 오염되지 않게 이력만 비운다(구현은 유지).
    claimableMock.mockClear();
    leagueClaimableMock.mockReturnValue({
      data: {
        gameId: 'g-1',
        version: 3,
        participants: [{ participantId: 'p-1', sideId: 's-1', displayName: '홍길동', jerseyNumber: 7 }],
      },
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<LeagueClaimMyRecordSection leagueId="lg-1" teamMatchId="tm-1" />);
    expect(leagueClaimableMock).toHaveBeenLastCalledWith('lg-1', 'tm-1', { enabled: false });

    fireEvent.click(screen.getByRole('button', { name: '명단에서 나 찾기' }));

    expect(leagueClaimableMock).toHaveBeenLastCalledWith('lg-1', 'tm-1', { enabled: true });
    expect(screen.getByText('명단에서 본인을 골라 주세요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /홍길동/ })).toBeInTheDocument();
    // 대회 훅으로 새지 않는다.
    expect(claimableMock).not.toHaveBeenCalled();
  });
});
