import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AwardsTab } from './awards-tab';
import type { V1TournamentAward } from '@/types/api';

const setAwardsMutate = vi.fn();
const setAwardSetsMutate = vi.fn();

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

const { playerRecordsHolder, awardsHolder, awardSetsHolder } = vi.hoisted(() => ({
  awardsHolder: { current: null as V1TournamentAward[] | null },
  awardSetsHolder: { current: [] as { id: string; bracketTrack: 'upper' | 'lower'; prizePool: number | null; prizeSummary: string | null; prizeBreakdown: string | null }[] },
  playerRecordsHolder: {
    current: undefined as undefined | { tournamentId: string; goals: unknown[]; assists: unknown[] },
    error: false,
  },
}));
const awardSetsQueryEnabled = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminTournamentRegistrations: () => ({
    data: { items: [{ id: 'reg-1', status: 'confirmed', teamId: 'team-1', teamName: 'A팀' }] },
  }),
  useV1AdminTournamentPlayers: () => ({
    data: { players: [{ id: 'player-1', userId: 'user-player-1', realName: '김선수' }] },
    isFetching: false,
  }),
  useV1AdminTournamentAwards: () => ({ data: awardsHolder.current ?? [award] }),
  useV1AdminTournamentAwardSets: (_tournamentId: string, enabled = true) => { awardSetsQueryEnabled(enabled); return { data: awardSetsHolder.current, isPending: false, isError: false, refetch: vi.fn() }; },
  // STATS-3 추천 chip — 기본은 빈 랭킹(기존 테스트 화면 불변). chip 시나리오는
  // holder를 채워 사용한다.
  useV1AdminTournamentPlayerRecords: () => ({ data: playerRecordsHolder.current, isError: playerRecordsHolder.error === true, refetch: vi.fn() }),
  useV1SetTournamentAwards: () => ({ mutate: setAwardsMutate, isPending: false }),
  useV1SetTournamentAwardSets: () => ({ mutate: setAwardSetsMutate, isPending: false }),
}));

describe('AwardsTab permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    awardSetsHolder.current = [];
  });

  it('shows award data without mutation affordances when the admin has read-only access', () => {
    render(<AwardsTab tournamentId="tournament-1" canWrite={false} showToast={vi.fn()} />);

    expect(screen.getByText(/^MVP · 전체$/)).toBeInTheDocument();
    expect(screen.getByText(/김선수/)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('조회 전용 권한');
    expect(screen.queryByRole('button', { name: '+ 항목 추가' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '항목 삭제' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /어워드 저장/ })).not.toBeInTheDocument();
  });

  it('read-only support can inspect lower-final awards while all mutation controls remain locked', async () => {
    awardSetsHolder.current = [
      { id: 'set-upper', bracketTrack: 'upper', prizePool: 300000, prizeSummary: '상위 시상', prizeBreakdown: null },
      { id: 'set-lower', bracketTrack: 'lower', prizePool: 100000, prizeSummary: '하위 시상', prizeBreakdown: null },
    ];
    const user = userEvent.setup();
    render(<AwardsTab tournamentId="tournament-1" canWrite={false} allowSplitAwards showToast={vi.fn()} />);

    const track = screen.getByLabelText('편집할 결선');
    expect(track).toBeEnabled();
    expect(screen.getByLabelText('총상금')).toHaveValue('300,000');
    expect(screen.getByLabelText('총상금')).toBeDisabled();
    expect(screen.getByLabelText('시상 안내')).toBeDisabled();
    expect(screen.queryByRole('button', { name: '상·하위 시상 저장' })).not.toBeInTheDocument();

    await user.selectOptions(track, 'lower');
    expect(screen.getByLabelText('총상금')).toHaveValue('100,000');
    expect(screen.getByLabelText('시상 안내')).toHaveValue('하위 시상');
    expect(screen.getByLabelText('총상금')).toBeDisabled();
    expect(screen.getByLabelText('시상 안내')).toBeDisabled();
    expect(setAwardSetsMutate).not.toHaveBeenCalled();
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

  it('persists the selected scope for personal awards', async () => {
    const user = userEvent.setup();
    render(<AwardsTab tournamentId="tournament-1" canWrite allowSplitAwards showToast={vi.fn()} />);

    await user.selectOptions(screen.getByLabelText('수상 범위'), 'upper');
    await user.click(screen.getByRole('button', { name: '어워드 저장' }));

    expect(setAwardsMutate).toHaveBeenCalledWith(
      [expect.objectContaining({ awardType: 'mvp', bracketTrack: 'upper' })],
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
  });

  it('saves split team prize fields through the award-set endpoint payload', async () => {
    const user = userEvent.setup();
    render(<AwardsTab tournamentId="tournament-1" canWrite allowSplitAwards showToast={vi.fn()} />);

    await user.selectOptions(screen.getByLabelText('편집할 결선'), 'lower');
    await user.type(screen.getByLabelText('총상금'), '250000');
    await user.type(screen.getByLabelText('시상 안내'), '하위 결선 우승팀');
    await user.click(screen.getByRole('button', { name: '상·하위 시상 저장' }));

    expect(setAwardSetsMutate).toHaveBeenCalledWith(
      [
        { bracketTrack: 'lower', prizePool: 250000, prizeSummary: '하위 결선 우승팀', prizeBreakdown: null },
      ],
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
  });

  it('clears both saved split scopes by persisting an empty award-set list', async () => {
    awardSetsHolder.current = [
      { id: 'set-upper', bracketTrack: 'upper', prizePool: 300000, prizeSummary: '상위 시상', prizeBreakdown: null },
      { id: 'set-lower', bracketTrack: 'lower', prizePool: 100000, prizeSummary: '하위 시상', prizeBreakdown: null },
    ];
    const user = userEvent.setup();
    render(<AwardsTab tournamentId="tournament-1" canWrite allowSplitAwards showToast={vi.fn()} />);

    const pool = screen.getByLabelText('총상금');
    const summary = screen.getByLabelText('시상 안내');
    await user.clear(pool);
    await user.clear(summary);
    await user.selectOptions(screen.getByLabelText('편집할 결선'), 'lower');
    await user.clear(screen.getByLabelText('총상금'));
    await user.clear(screen.getByLabelText('시상 안내'));
    await user.click(screen.getByRole('button', { name: '상·하위 시상 저장' }));

    expect(setAwardSetsMutate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
    awardSetsHolder.current = [];
  });

  it('preserves a deliberately entered zero prize pool while omitting the other empty scope', async () => {
    const user = userEvent.setup();
    render(<AwardsTab tournamentId="tournament-1" canWrite allowSplitAwards showToast={vi.fn()} />);

    await user.type(screen.getByLabelText('총상금'), '0');
    await user.click(screen.getByRole('button', { name: '상·하위 시상 저장' }));

    expect(setAwardSetsMutate).toHaveBeenCalledWith(
      [{ bracketTrack: 'upper', prizePool: 0, prizeSummary: null, prizeBreakdown: null }],
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
  });

  it('does not query or expose split controls before an exact regular tournament kind is hydrated', () => {
    render(<AwardsTab tournamentId="tournament-1" canWrite showToast={vi.fn()} />);
    expect(awardSetsQueryEnabled).toHaveBeenCalledWith(false);
    expect(screen.queryByRole('region', { name: '팀 시상 안내' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('수상 범위')).toHaveValue('overall');
    expect(screen.queryByRole('option', { name: '상위 결선' })).not.toBeInTheDocument();
  });

  it('preserves a loaded personal award scope when the editor has no split-scope permission', async () => {
    awardsHolder.current = [{ ...award, bracketTrack: 'upper' }];
    const user = userEvent.setup();
    render(<AwardsTab tournamentId="tournament-1" canWrite showToast={vi.fn()} />);
    const scope = screen.getByLabelText('수상 범위');
    expect(scope).toHaveValue('upper');
    expect(scope).toBeDisabled();

    await user.click(screen.getByRole('button', { name: '어워드 저장' }));
    expect(setAwardsMutate).toHaveBeenCalledWith(
      [expect.objectContaining({ awardType: 'mvp', bracketTrack: 'upper' })],
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
  });
});

// 실제 AwardsTab/AwardRow의 local draft 계약을 확인한다. jsdom은 flex 폭·링·
// 페이지 overflow를 계산하지 않으므로 이 테스트는 alpha 시각 RED→GREEN 증거가 아니다.
describe('#1571 AwardsTab 빈 로컬 초안 상호작용', () => {
  beforeEach(() => { vi.clearAllMocks(); awardsHolder.current = []; });
  afterEach(() => { awardsHolder.current = null; });

  it('추가와 연속 제목 입력 뒤 Tab/Shift+Tab 및 Enter로 로컬 행을 제거한다', async () => {
    const user = userEvent.setup();
    render(<AwardsTab tournamentId="tournament-1" canWrite showToast={vi.fn()} />);
    expect(screen.getByText('등록된 개인 어워드가 없어요.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '+ 항목 추가' }));
    const title = screen.getByPlaceholderText('어워드명 (예: MVP)');
    await user.type(title, '합성 수상명 연속 입력 확인');
    expect(title).toHaveValue('합성 수상명 연속 입력 확인');
    await user.tab();
    expect(screen.getByRole('button', { name: '항목 삭제' })).toHaveFocus();
    await user.tab({ shift: true }); expect(title).toHaveFocus();
    await user.tab(); await user.keyboard('{Enter}');
    expect(screen.queryByPlaceholderText('어워드명 (예: MVP)')).not.toBeInTheDocument();
    expect(screen.getByText('등록된 개인 어워드가 없어요.')).toBeInTheDocument();
    expect(setAwardsMutate).not.toHaveBeenCalled();
  });

  it('두 행 중 지정 행만 제거하고 나머지 입력과 다시 추가를 유지한다', async () => {
    const user = userEvent.setup();
    render(<AwardsTab tournamentId="tournament-1" canWrite showToast={vi.fn()} />);
    const add = screen.getByRole('button', { name: '+ 항목 추가' });
    await user.click(add); await user.click(add);
    const titles = screen.getAllByPlaceholderText('어워드명 (예: MVP)');
    await user.type(titles[0], '첫 번째 초안'); await user.type(titles[1], '남길 초안');
    await user.click(titles[0]); await user.tab(); await user.keyboard('{Enter}');
    expect(screen.queryByDisplayValue('첫 번째 초안')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('남길 초안')).toBeInTheDocument();
    await user.click(add);
    expect(screen.getAllByPlaceholderText('어워드명 (예: MVP)')).toHaveLength(2);
    expect(screen.getByDisplayValue('남길 초안')).toBeInTheDocument();
    expect(setAwardsMutate).not.toHaveBeenCalled();
  });

  it('저장하지 않은 초안은 unmount/remount 시 빈 조회로 돌아간다', async () => {
    const user = userEvent.setup();
    const first = render(<AwardsTab tournamentId="tournament-1" canWrite showToast={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '+ 항목 추가' }));
    await user.type(screen.getByPlaceholderText('어워드명 (예: MVP)'), '저장하지 않은 초안');
    first.unmount();
    render(<AwardsTab tournamentId="tournament-1" canWrite showToast={vi.fn()} />);
    expect(screen.getByText('등록된 개인 어워드가 없어요.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '항목 삭제' })).not.toBeInTheDocument();
    expect(setAwardsMutate).not.toHaveBeenCalled();
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
    playerRecordsHolder.error = false;
  });

  it('랭킹 조회가 실패하면 조용히 사라지지 않고 실패 상태를 명시한다', () => {
    playerRecordsHolder.current = undefined;
    playerRecordsHolder.error = true;
    render(<AwardsTab tournamentId="tournament-1" canWrite showToast={vi.fn()} />);
    expect(screen.getByText(/조회에 실패한 상태예요/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument();
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

  it('동점이면 공동 순위로 표시하고, 같은 순위 선수를 3명에서 자르지 않는다', () => {
    playerRecordsHolder.current = {
      tournamentId: 'tournament-1',
      goals: [
        { userId: 'u1', name: '가선수', teamName: 'A팀', goals: 2, assists: 0 },
        { userId: 'u2', name: '나선수', teamName: 'A팀', goals: 2, assists: 0 },
        { userId: 'u3', name: '다선수', teamName: 'B팀', goals: 2, assists: 0 },
        { userId: 'u4', name: '라선수', teamName: 'B팀', goals: 2, assists: 0 },
        { userId: 'u5', name: '마선수', teamName: 'B팀', goals: 1, assists: 0 },
      ],
      assists: [],
    };
    render(<AwardsTab tournamentId="tournament-1" canWrite showToast={vi.fn()} />);

    for (const name of ['가선수', '나선수', '다선수', '라선수']) {
      expect(screen.getByRole('button', { name: new RegExp(`득점 상위 공동 1위 ${name} 2골`) })).toBeInTheDocument();
    }
    expect(screen.queryByRole('button', { name: /득점 상위 [23]위/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /마선수/ })).not.toBeInTheDocument();
  });

  it('동점이 아닌 선수는 그대로 단독 순위를 쓰고 뒤따르는 동점만 공동이 된다', () => {
    playerRecordsHolder.current = {
      tournamentId: 'tournament-1',
      goals: [
        { userId: 'u1', name: '가선수', teamName: 'A팀', goals: 5, assists: 0 },
        { userId: 'u2', name: '나선수', teamName: 'A팀', goals: 3, assists: 0 },
        { userId: 'u3', name: '다선수', teamName: 'B팀', goals: 3, assists: 0 },
        { userId: 'u4', name: '라선수', teamName: 'B팀', goals: 1, assists: 0 },
      ],
      assists: [],
    };
    render(<AwardsTab tournamentId="tournament-1" canWrite showToast={vi.fn()} />);

    expect(screen.getByRole('button', { name: /득점 상위 1위 가선수 5골/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /득점 상위 공동 2위 나선수 3골/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /득점 상위 공동 2위 다선수 3골/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /라선수/ })).not.toBeInTheDocument();
  });

  it('읽기 전용 권한에서는 chip이 렌더되지 않는다', () => {
    render(<AwardsTab tournamentId="tournament-1" canWrite={false} showToast={vi.fn()} />);
    expect(screen.queryByText(/추천 근거/)).not.toBeInTheDocument();
  });
});
