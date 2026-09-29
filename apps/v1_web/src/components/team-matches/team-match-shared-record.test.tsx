import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TeamMatchSharedRecord, TeamMatchRecordEntry } from './team-match-shared-record';
import type { SharedRecord } from '@/hooks/use-team-match-record';

const state = vi.hoisted(() => ({ data: {} as SharedRecord, mutate: vi.fn(), refetch: vi.fn(), replace: vi.fn(), search: '' }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: state.replace }),
  useSearchParams: () => new URLSearchParams(state.search),
}));
vi.mock('@/hooks/use-team-match-record', () => ({
  useTeamMatchRecord: () => ({ data: state.data, isError: false, refetch: state.refetch }),
  useMutateTeamMatchRecord: () => ({ mutateAsync: state.mutate, isPending: false, isError: false, reset: vi.fn() }),
}));
beforeEach(() => {
  state.mutate.mockReset().mockResolvedValue({});
  state.replace.mockReset();
  state.search = '';
  state.data = {
    teamMatchId: 'match', title: '한강 vs 마포', startsAt: '2026-09-21T00:00:00Z', phase: 'live', version: 3,
    serverTime: '2026-09-21T01:00:00Z', canEdit: true, participant: true, ownSideId: 'home',
    lineupReady: true, missingSides: [],
    sides: [{ id: 'home', key: 'HOME', name: '한강', score: 0 }, { id: 'away', key: 'AWAY', name: '마포', score: 0 }],
    participants: [
      { id: 'h1', sideId: 'home', name: '김민수', jerseyNumber: 7, profileImageUrl: '/mock/players/minsu.jpg' },
      { id: 'a1', sideId: 'away', name: '박지훈', jerseyNumber: 10, profileImageUrl: null },
    ],
    subMatches: [], goals: [], confirmations: [], history: [], officialAt: null,
  };
});
describe('shared record participant flow', () => {
  // 2026-09-29: "← 매치 상세" 카드 링크는 제거했다 — 뒤로가기는 매치 상세를 거치지 않고
  // 이 화면이 받은 출처로 곧장 돌아간다(활동기록 등). 출처가 아예 없을 때만(공유 링크로
  // 바로 들어온 경우) route-chrome 의 정적 backHref가 `?view=detail`로 매치 상세를 대신 가리킨다.
  it('경기 기록 화면에는 매치 상세로 가는 버튼이 없다', () => {
    render(<TeamMatchSharedRecord teamMatchId="match" />);
    expect(screen.queryByRole('link', { name: '← 매치 상세' })).not.toBeInTheDocument();
  });

  it('공동 경기 기록 열기 링크가 받은 출처를 그대로 뒤로가기 경로로 싣는다', () => {
    render(<TeamMatchRecordEntry teamMatchId="match" detailOnly fromHref="/my/team-matches" />);
    expect(screen.getByRole('link', { name: '공동 경기 기록 열기' })).toHaveAttribute(
      'href',
      `/team-matches/match/record?from=${encodeURIComponent('/my/team-matches')}`,
    );
  });

  it('출처가 없으면 뒤로가기 경로 없이 열린다 — 셸이 정적 backHref(?view=detail)로 대신한다', () => {
    render(<TeamMatchRecordEntry teamMatchId="match" detailOnly />);
    expect(screen.getByRole('link', { name: '공동 경기 기록 열기' })).toHaveAttribute('href', '/team-matches/match/record');
  });

  it('확정 결과의 득점 기록을 대회 결과 축으로 펼치고 일반 득점은 검정, 자책골은 빨강으로 표시한다', () => {
    state.data = {
      ...state.data,
      phase: 'official',
      canEdit: false,
      officialAt: state.data.serverTime,
      sides: [
        { id: 'home', key: 'HOME', name: '한강', score: 2 },
        { id: 'away', key: 'AWAY', name: '마포', score: 1 },
      ],
      goalEvents: [
        { sideId: 'home', participantName: '김민수', minute: 12, ownGoal: false, subMatchId: null },
        { sideId: 'away', participantName: '박지훈', minute: 18, ownGoal: false, subMatchId: null },
        { sideId: 'home', participantName: '박지훈', minute: 24, ownGoal: true, subMatchId: null },
      ],
    };
    const { container } = render(<TeamMatchRecordEntry teamMatchId="match" detailOnly />);
    const toggle = screen.getByRole('button', { name: '득점 기록 보기 (3)' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('link', { name: '공동 경기 기록 열기' })).toBeInTheDocument();

    fireEvent.click(toggle);

    expect(screen.getByRole('button', { name: '득점 기록 접기 (3)' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('list', { name: '득점 기록' })).toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: '홈 12분 김민수 골' })).toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: '원정 18분 박지훈 골' })).toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: '홈 24분 박지훈 자책골' })).toBeInTheDocument();
    expect(screen.getByText('OG')).toBeInTheDocument();
    const goalMarkers = Array.from(container.querySelectorAll('[data-goal-marker="goal"]'));
    expect(goalMarkers).toHaveLength(2);
    for (const marker of goalMarkers) expect(marker).toHaveStyle({ color: 'var(--text-strong)' });
    const ownGoalMarkers = Array.from(container.querySelectorAll('[data-goal-marker="own-goal"]'));
    expect(ownGoalMarkers).toHaveLength(1);
    expect(ownGoalMarkers[0]).toHaveStyle({ color: 'var(--red500)' });
  });

  it('0대0 확정 결과는 빈 아코디언 대신 득점 없음 상태를 보여준다', () => {
    state.data = {
      ...state.data,
      phase: 'official',
      canEdit: false,
      officialAt: state.data.serverTime,
      goalEvents: [],
    };
    render(<TeamMatchRecordEntry teamMatchId="match" detailOnly />);
    expect(screen.getByText('등록된 득점이 없어요.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /득점 기록 보기/ })).not.toBeInTheDocument();
  });

  it('라이브 참가자는 받은 출처를 그대로 실은 경로로 자동 리다이렉트된다', () => {
    render(<TeamMatchRecordEntry teamMatchId="match" fromHref="/my/team-matches" />);
    expect(state.replace).toHaveBeenCalledWith(`/team-matches/match/record?from=${encodeURIComponent('/my/team-matches')}`);
  });

  // 회귀 방지: 뒤로가기로 `?view=detail`에 도착하면(detailOnly=true) 참가자·라이브여도
  // 다시 이 화면으로 리다이렉트하지 않아야 한다 — 안 그러면 뒤로가기가 replace→replace로
  // 제자리에 돌아와 아무 반응이 없어 보인다(2026-09-29 실사고, alpha 실측으로 확인).
  it('view=detail로 도착하면 참가자·라이브여도 다시 이 화면으로 리다이렉트하지 않는다', () => {
    render(<TeamMatchRecordEntry teamMatchId="match" detailOnly fromHref="/my/team-matches" />);
    expect(state.replace).not.toHaveBeenCalled();
  });

  it('공동 기록 이전 경기(legacy)는 출처를 실은 채 매치 상세로 넘긴다', () => {
    state.data = { ...state.data, phase: 'legacy' };
    state.search = `from=${encodeURIComponent('/users/u1/records')}`;
    render(<TeamMatchSharedRecord teamMatchId="match" />);
    expect(state.replace).toHaveBeenCalledWith(`/team-matches/match?view=detail&from=${encodeURIComponent('/users/u1/records')}`);
    expect(screen.queryByText('이 경기는 기존 경기 기록 화면에서 확인할 수 있어요.')).toBeNull();
  });

  it('운영 관리 경기(managed)도 출처가 없으면 매치 상세로만 넘긴다', () => {
    state.data = { ...state.data, phase: 'managed' };
    render(<TeamMatchSharedRecord teamMatchId="match" />);
    expect(state.replace).toHaveBeenCalledWith('/team-matches/match?view=detail');
  });

  it('공동 기록 경기(live)는 넘기지 않고 이 화면에서 기록을 보여준다', () => {
    state.search = `from=${encodeURIComponent('/users/u1/records')}`;
    render(<TeamMatchSharedRecord teamMatchId="match" />);
    expect(state.replace).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '득점 추가' })).toBeInTheDocument();
  });

  it('selects scorer from the credited team and sends the opened version with the goal', async () => {
    render(<TeamMatchSharedRecord teamMatchId="match" />);
    fireEvent.click(screen.getByRole('button', { name: '득점 추가' }));
    expect(screen.queryByRole('radio', { name: /박지훈/ })).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: /김민수/ }));
    fireEvent.change(screen.getByLabelText('득점 시간 (선택)'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: '득점 등록' }));
    await waitFor(() => expect(state.mutate).toHaveBeenCalledWith(expect.objectContaining({ action: 'add', expectedVersion: 3, sideId: 'home', participantId: 'h1', minute: 12, ownGoal: false })));
  });
  it('shows player photos and offers the opposing roster for an own goal', () => {
    const { container } = render(<TeamMatchSharedRecord teamMatchId="match" />);
    fireEvent.click(screen.getByRole('button', { name: '득점 추가' }));
    expect(container.querySelector('img[src="/mock/players/minsu.jpg"]')).not.toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: /자책골/ }));
    expect(screen.queryByRole('radio', { name: /김민수/ })).toBeNull();
    expect(screen.getByRole('radio', { name: /박지훈/ })).toBeInTheDocument();
  });
  it('득점 카드는 선수·팀·시간을 구분하고 수정·삭제를 별도 관리 영역으로 묶는다', () => {
    state.data = {
      ...state.data,
      sides: [
        { id: 'home', key: 'HOME', name: '한강 런너스 풀백 축구클럽', score: 1 },
        { id: 'away', key: 'AWAY', name: '마포', score: 0 },
      ],
      goals: [{ id: 'g1', sideId: 'home', participantId: 'h1', ownGoal: false, minute: 12, subMatchId: null }],
    };

    render(<TeamMatchSharedRecord teamMatchId="match" />);

    const goalRow = screen.getByRole('group', { name: '김민수 득점 기록' });
    expect(within(goalRow).getByText('김민수')).toBeInTheDocument();
    expect(within(goalRow).getByText('한강 런너스 풀백 축구클럽')).toBeInTheDocument();
    expect(within(goalRow).getByLabelText('득점 시간 12분')).toHaveTextContent('12분');
    const actions = screen.getByRole('group', { name: '김민수 득점 관리' });
    expect(within(actions).getByRole('button', { name: /수정$/ })).toBeInTheDocument();
    expect(within(actions).getByRole('button', { name: /삭제$/ })).toHaveClass('tm-btn-ghost');
  });
  it('does not overwrite a newer remote edit while a local form is open', () => {
    const { rerender } = render(<TeamMatchSharedRecord teamMatchId="match" />);
    fireEvent.click(screen.getByRole('button', { name: '득점 추가' }));
    fireEvent.click(screen.getByRole('radio', { name: /김민수/ }));
    state.data = { ...state.data, version: 4 };
    rerender(<TeamMatchSharedRecord teamMatchId="match" />);
    expect(screen.getByRole('radio', { name: /김민수/ })).toBeChecked();
    expect(screen.getByRole('button', { name: '득점 등록' })).toBeDisabled();
    expect(state.mutate).not.toHaveBeenCalled();
  });
  it('requires explicit end confirmation for the same record version', () => {
    const { rerender } = render(<TeamMatchSharedRecord teamMatchId="match" />);
    fireEvent.click(screen.getByRole('button', { name: '우리 팀 종료 확인' }));
    expect(state.mutate).not.toHaveBeenCalled();
    state.data = { ...state.data, version: 4 };
    rerender(<TeamMatchSharedRecord teamMatchId="match" />);
    expect(screen.getByRole('button', { name: '이 기록으로 종료 확인' })).toBeDisabled();
  });
  it('removes all mutation controls when official or spectator', () => {
    state.data = { ...state.data, phase: 'official', canEdit: false, officialAt: state.data.serverTime };
    const { rerender } = render(<TeamMatchSharedRecord teamMatchId="match" />);
    expect(screen.queryByRole('button', { name: '득점 추가' })).toBeNull();
    expect(screen.getByText('결과가 확정되어 기록이 잠겼어요.')).toBeInTheDocument();
    state.data = { ...state.data, phase: 'live', participant: false };
    rerender(<TeamMatchSharedRecord teamMatchId="match" />);
    expect(screen.queryByRole('button', { name: '우리 팀 종료 확인' })).toBeNull();
  });
  it('flags a potentially duplicate goal instead of blindly adding it', () => {
    state.data.goals = [{ id: 'g1', sideId: 'home', participantId: null, ownGoal: false, minute: null, subMatchId: null }];
    render(<TeamMatchSharedRecord teamMatchId="match" />);
    fireEvent.click(screen.getByRole('button', { name: '득점 추가' }));
    expect(screen.getByRole('button', { name: '득점 등록' })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: /별개의 득점/ }));
    expect(screen.getByRole('button', { name: '득점 등록' })).toBeEnabled();
  });
  it('shows the aggregate and assigns a new goal to the selected submatch', async () => {
    state.data = {
      ...state.data,
      sides: [{ id: 'home', key: 'HOME', name: '서강', score: 3 }, { id: 'away', key: 'AWAY', name: '마포', score: 2 }],
      subMatches: [
        { id: '11111111-1111-4111-8111-111111111111', title: '1경기', order: 0, scores: [{ sideId: 'home', score: 2 }, { sideId: 'away', score: 1 }] },
        { id: '22222222-2222-4222-8222-222222222222', title: '2경기', order: 1, scores: [{ sideId: 'home', score: 1 }, { sideId: 'away', score: 1 }] },
      ],
    };
    render(<TeamMatchSharedRecord teamMatchId="match" />);
    expect(screen.getByLabelText('점수 3 대 2')).toBeInTheDocument();
    expect(screen.getByLabelText('1경기 점수 2 대 1')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: '이 서브매치에 득점 추가' })[1]);
    fireEvent.click(screen.getByRole('button', { name: '득점 등록' }));
    await waitFor(() => expect(state.mutate).toHaveBeenCalledWith(expect.objectContaining({
      action: 'add', subMatchId: '22222222-2222-4222-8222-222222222222', expectedVersion: 3,
    })));
  });

  it('replaces the submatch heading with its rename form', () => {
    state.data = {
      ...state.data,
      subMatches: [{ id: '11111111-1111-4111-8111-111111111111', title: '1경기', order: 0, scores: [{ sideId: 'home', score: 0 }, { sideId: 'away', score: 0 }] }],
    };
    render(<TeamMatchSharedRecord teamMatchId="match" />);
    fireEvent.click(screen.getByRole('button', { name: '이름 수정' }));
    expect(screen.getByRole('form', { name: '1경기 이름 변경' })).toBeInTheDocument();
    expect(screen.getByLabelText('서브매치 이름')).toHaveValue('1경기');
    expect(screen.queryByText('1경기')).toBeNull();
  });

  it('creates an optional submatch without removing the shared participant controls', async () => {
    render(<TeamMatchSharedRecord teamMatchId="match" />);
    fireEvent.click(screen.getByRole('button', { name: '서브매치 추가' }));
    fireEvent.change(screen.getByLabelText('서브매치 이름'), { target: { value: '전반전' } });
    fireEvent.click(screen.getByRole('button', { name: '서브매치 만들기' }));
    await waitFor(() => expect(state.mutate).toHaveBeenCalledWith(expect.objectContaining({ action: 'submatch_add', title: '전반전', expectedVersion: 3 })));
    expect(screen.getByRole('button', { name: '우리 팀 종료 확인' })).toBeInTheDocument();
  });
});
