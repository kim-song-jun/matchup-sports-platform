import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ClaimMyRecordSection, LeagueClaimMyRecordSection, TeamMatchClaimMyRecordSection } from './claim-my-record';

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
const requestMutateMock = vi.fn();
const leagueRequestMutateMock = vi.fn();
const teamMatchClaimableMock = vi.fn();
vi.mock('@/hooks/use-v1-api', () => ({
  useV1TeamMatchClaimableParticipants: (...args: unknown[]) => teamMatchClaimableMock(...args),
  useV1TeamMatchRequestIdentityLink: () => ({ mutate: vi.fn(), isPending: false }),
  useV1ClaimableParticipants: (...args: unknown[]) => claimableMock(...args),
  useV1RequestIdentityLink: () => ({ mutate: requestMutateMock, isPending: false }),
  useV1LeagueClaimableParticipants: (...args: unknown[]) => leagueClaimableMock(...args),
  useV1LeagueRequestIdentityLink: () => ({ mutate: leagueRequestMutateMock, isPending: false }),
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
      data: { gameId: 'g-1', version: 3, rosterCount: 4, participants: [] },
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
        rosterCount: 2,
        participants: [{ participantId: 'p-1', sideId: 's-1', sideKey: 'HOME', sideLabel: '블루팀', displayName: '홍길동', jerseyNumber: 7 }],
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
        rosterCount: 2,
        participants: [{ participantId: 'p-1', sideId: 's-1', sideKey: 'HOME', sideLabel: '블루팀', displayName: '홍길동', jerseyNumber: 7 }],
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

  it('같은 이름·등번호 없음도 팀/사이드 라벨로 구분하고 선택한 participantId를 보낸다', () => {
    leagueClaimableMock.mockReturnValue({
      data: {
        gameId: 'g-1',
        version: 3,
        rosterCount: 2,
        participants: [
          { participantId: 'p-home', sideId: 's-home', sideKey: 'HOME', sideLabel: '블루팀', displayName: 'E2E 선수01', jerseyNumber: null },
          { participantId: 'p-away', sideId: 's-away', sideKey: 'AWAY', sideLabel: '레드팀', displayName: 'E2E 선수01', jerseyNumber: null },
        ],
      },
      isLoading: false,
      isError: false,
      error: null,
    });
    leagueRequestMutateMock.mockClear();
    render(<LeagueClaimMyRecordSection leagueId="lg-1" teamMatchId="tm-1" />);
    fireEvent.click(screen.getByRole('button', { name: '명단에서 나 찾기' }));

    const candidates = screen.getAllByRole('button', { name: /E2E 선수01/ });
    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toHaveAccessibleName(/블루팀.*홈.*E2E 선수01/);
    expect(candidates[1]).toHaveAccessibleName(/레드팀.*원정.*E2E 선수01/);
    fireEvent.click(candidates[1]);
    fireEvent.click(screen.getByRole('button', { name: '이 선수가 저예요' }));
    expect(leagueRequestMutateMock).toHaveBeenCalledWith(
      { gameId: 'g-1', participantId: 'p-away', expectedVersion: 3 },
      expect.anything(),
    );
  });
});

describe('LeagueClaimMyRecordSection — 명단 카드 아래 한 줄(G13 F61)', () => {
  it('link 는 카드 대신 한 줄 버튼이고, 누르면 같은 모달로 리그 목록을 부른다', () => {
    leagueClaimableMock.mockReturnValue({ data: { gameId: 'g-1', version: 1, rosterCount: 2, participants: [] }, isLoading: false, isError: false, error: null });
    render(<LeagueClaimMyRecordSection leagueId="lg-1" teamMatchId="tm-1" variant="link" />);

    expect(screen.queryByText('이 경기에 뛰었는데 내 기록이 없나요?')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '내 기록이 안 보이나요? 명단에서 나 찾기' }));
    expect(leagueClaimableMock).toHaveBeenLastCalledWith('lg-1', 'tm-1', { enabled: true });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

// W5-V3 — 후보 0명이 "명단이 아직 없음"인데 "명단은 모두 계정에 연결돼 있어요"라고 말하던 결함.
describe('명단에서 나 찾기 — 후보 0명의 두 상태(rosterCount)', () => {
  const emptyList = (rosterCount: number) => ({
    data: { gameId: 'g-1', version: 1, rosterCount, participants: [] }, isLoading: false, isError: false, error: null,
  });
  const openTeamMatch = () => {
    render(<TeamMatchClaimMyRecordSection teamMatchId="tm-1" />);
    fireEvent.click(screen.getByRole('button', { name: '명단에서 나 찾기' }));
  };

  it('친선에서 명단이 0명이면 "아직 제출된 참석명단이 없어요"라고 말하고, 모두 연결됐다고 하지 않는다', () => {
    teamMatchClaimableMock.mockReturnValue(emptyList(0));
    openTeamMatch();

    expect(screen.getByRole('dialog', { name: '아직 제출된 참석명단이 없어요' })).toBeInTheDocument();
    expect(screen.queryByText(/모두 계정에 연결돼 있어요/)).toBeNull();
    expect(screen.queryByRole('link', { name: '기록 공개 설정' })).toBeNull();
    expect(screen.queryByRole('button', { name: '이 선수가 저예요' })).toBeNull();
  });

  it('대조군 — 명단은 있는데 모두 연결됐으면 기존 안내와 기록 공개 설정 링크를 보여 준다', () => {
    teamMatchClaimableMock.mockReturnValue(emptyList(10));
    openTeamMatch();

    expect(screen.getByRole('dialog', { name: '연결할 참가자가 없어요' })).toBeInTheDocument();
    expect(screen.getByText(/모두 계정에 연결돼 있어요/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '기록 공개 설정' })).toBeInTheDocument();
    expect(screen.queryByText('아직 제출된 참석명단이 없어요')).toBeNull();
  });

  it('리그·대회 경기는 같은 상태를 "경기 명단"으로 부른다', () => {
    leagueClaimableMock.mockReturnValue(emptyList(0));
    render(<LeagueClaimMyRecordSection leagueId="lg-1" teamMatchId="tm-1" />);
    fireEvent.click(screen.getByRole('button', { name: '명단에서 나 찾기' }));

    expect(screen.getByRole('dialog', { name: '아직 제출된 경기 명단이 없어요' })).toBeInTheDocument();
  });
});
