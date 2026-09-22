import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TeamMatchSharedRecord } from './team-match-shared-record';
import type { SharedRecord } from '@/hooks/use-team-match-record';

const state = vi.hoisted(() => ({ data: {} as SharedRecord, mutate: vi.fn(), refetch: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock('@/hooks/use-team-match-record', () => ({
  useTeamMatchRecord: () => ({ data: state.data, isError: false, refetch: state.refetch }),
  useMutateTeamMatchRecord: () => ({ mutateAsync: state.mutate, isPending: false, isError: false, reset: vi.fn() }),
}));
beforeEach(() => {
  state.mutate.mockReset().mockResolvedValue({});
  state.data = {
    teamMatchId: 'match', title: '한강 vs 마포', startsAt: '2026-09-21T00:00:00Z', phase: 'live', version: 3,
    serverTime: '2026-09-21T01:00:00Z', canEdit: true, participant: true, ownSideId: 'home',
    sides: [{ id: 'home', key: 'HOME', name: '한강', score: 0 }, { id: 'away', key: 'AWAY', name: '마포', score: 0 }],
    participants: [
      { id: 'h1', sideId: 'home', name: '김민수', jerseyNumber: 7, profileImageUrl: '/mock/players/minsu.jpg' },
      { id: 'a1', sideId: 'away', name: '박지훈', jerseyNumber: 10, profileImageUrl: null },
    ],
    subMatches: [], goals: [], confirmations: [], history: [], officialAt: null,
  };
});
describe('shared record participant flow', () => {
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
