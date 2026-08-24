import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AwardsTab } from './awards-tab';
import type { V1TournamentAward } from '@/types/api';

const setAwardsMutate = vi.fn();

const award: V1TournamentAward = {
  id: 'award-1',
  awardType: 'mvp',
  awardLabel: 'MVP',
  iconKey: 'trophy',
  recipientName: '김선수',
  recipientUserId: 'user-player-1',
  teamName: 'A팀',
  note: '3골 1어시스트',
};

const { playerRecordsHolder } = vi.hoisted(() => ({
  playerRecordsHolder: { current: undefined as undefined | { tournamentId: string; goals: unknown[]; assists: unknown[] } },
}));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminTournamentRegistrations: () => ({
    data: { items: [{ id: 'reg-1', status: 'confirmed', teamId: 'team-1', teamName: 'A팀' }] },
  }),
  useV1AdminTournamentPlayers: () => ({
    data: { players: [{ id: 'player-1', userId: 'user-player-1', realName: '김선수' }] },
    isFetching: false,
  }),
  useV1AdminTournamentAwards: () => ({ data: [award] }),
  // STATS-3 추천 chip — 기본은 빈 랭킹(기존 테스트 화면 불변). chip 시나리오는
  // holder를 채워 사용한다.
  useV1AdminTournamentPlayerRecords: () => ({ data: playerRecordsHolder.current }),
  useV1SetTournamentAwards: () => ({ mutate: setAwardsMutate, isPending: false }),
}));

describe('AwardsTab permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows award data without mutation affordances when the admin has read-only access', () => {
    render(<AwardsTab tournamentId="tournament-1" canWrite={false} showToast={vi.fn()} />);

    expect(screen.getByText('MVP')).toBeInTheDocument();
    expect(screen.getByText(/김선수/)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('조회 전용 권한');
    expect(screen.queryByRole('button', { name: '+ 항목 추가' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '항목 삭제' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /어워드 저장/ })).not.toBeInTheDocument();
  });

  it('keeps add, remove, and save affordances for mutation-capable admins', async () => {
    const user = userEvent.setup();
    render(<AwardsTab tournamentId="tournament-1" canWrite showToast={vi.fn()} />);

    expect(screen.getByRole('button', { name: '+ 항목 추가' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '항목 삭제' })).toBeEnabled();

    const saveButton = screen.getByRole('button', { name: /어워드 저장/ });
    expect(saveButton).toBeEnabled();

    await user.click(saveButton);
    expect(setAwardsMutate).toHaveBeenCalled();
  });
});

describe('AwardsTab 추천 근거 chip (STATS-3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    playerRecordsHolder.current = {
      tournamentId: 'tournament-1',
      goals: [
        { userId: 'user-top', name: '김득점', teamName: 'A팀', goals: 7, assists: 1 },
      ],
      assists: [
        { userId: null, name: '박도움', teamName: 'B팀', goals: 0, assists: 4 },
      ],
    };
  });
  afterEach(() => {
    playerRecordsHolder.current = undefined;
  });

  it('chip을 탭하면 이름·계정·팀이 미리 채워진 수상 항목이 추가된다', async () => {
    const user = userEvent.setup();
    render(<AwardsTab tournamentId="tournament-1" canWrite showToast={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /득점 상위 1위 김득점 7골/ }));
    expect(screen.getByDisplayValue('득점왕')).toBeInTheDocument();
    // chip 자체 + 새 행의 수상자 picker 값 — 두 곳에 나타나야 채움이 증명된다.
    expect(screen.getAllByText('김득점')).toHaveLength(2);
  });

  it('계정 미연결 후보 chip은 이름·팀만 채운다 — 계정 없인 저장 검증에 걸린다', async () => {
    const user = userEvent.setup();
    render(<AwardsTab tournamentId="tournament-1" canWrite showToast={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /도움 상위 1위 박도움 4도움/ }));
    expect(screen.getByDisplayValue('도움왕')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '어워드 저장' }));
    expect(setAwardsMutate).not.toHaveBeenCalled();
  });

  it('읽기 전용 권한에서는 chip이 렌더되지 않는다', () => {
    render(<AwardsTab tournamentId="tournament-1" canWrite={false} showToast={vi.fn()} />);
    expect(screen.queryByText(/추천 근거/)).not.toBeInTheDocument();
  });
});
