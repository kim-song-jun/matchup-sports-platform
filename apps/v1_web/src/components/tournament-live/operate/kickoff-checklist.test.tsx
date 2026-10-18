import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OPERATIONS_BOARD_POLL_INTERVAL_MS } from '@/lib/operations-board-polling';
import type { GameLineup, GameLineupParticipant, GameSide } from '@/types/game-operations';
import { KickoffChecklist } from './kickoff-checklist';

const mocks = vi.hoisted(() => ({
  useV1TeamGameRoster: vi.fn(),
  setParticipation: vi.fn(),
  href: { value: '/admin/live/l-1/fixtures/f-1/operate' as string | null },
}));

vi.mock('@/hooks/use-v1-game-roster', () => ({
  useV1TeamGameRoster: (...args: unknown[]) => mocks.useV1TeamGameRoster(...args),
  useV1SetGameRosterParticipation: () => ({ mutateAsync: mocks.setParticipation }),
}));
vi.mock('@/components/v1-ui/use-current-href', () => ({ useCurrentHref: () => mocks.href.value }));

function side(id: string, teamId: string | null, name: string): GameSide {
  return {
    id, gameId: 'g-1', sideKey: id === 'side-home' ? 'HOME' : 'AWAY', teamId,
    displayNameSnapshot: name, createdAt: '', updatedAt: '',
  };
}

function participant(id: string, sideId: string, lineupId: string, arrivedAt: string | null): GameLineupParticipant {
  return {
    id, gameId: 'g-1', sideId, lineupId, userId: null, displayNameSnapshot: `선수 ${id}`, jerseyNumber: null,
    position: null, positionX: null, positionY: null, started: true, arrivedAt, createdAt: '', updatedAt: '',
  };
}

function lineup(sideId: string, participants: GameLineupParticipant[]): GameLineup {
  return {
    id: `lineup-${sideId}`, gameId: 'g-1', sideId, revision: 1, state: 'SUBMITTED', version: 0,
    submittedAt: '', supersedesId: null, formation: null, createdAt: '', updatedAt: '', participants, invalidatedAt: null,
  };
}

const SIDES = [side('side-home', 'team-red', '레드팀'), side('side-away', 'team-blue', '블루팀')];
const NOT_YET = null;
const ARRIVED = '2026-09-30T00:50:00.000Z';

function lineups(homeArrived: string | null, awayArrived: string | null) {
  return [
    lineup('side-home', [participant('h1', 'side-home', 'lineup-side-home', homeArrived)]),
    lineup('side-away', [participant('a1', 'side-away', 'lineup-side-away', awayArrived)]),
  ];
}

function rosterData(counts: { excluded: number; unavailable: number; suspended: number }) {
  return { data: { counts: { base: 10, participating: 8, ...counts } }, isPending: false, isError: false };
}

function renderChecklist(props: { lineups: GameLineup[]; disabled?: boolean }) {
  return render(
    <KickoffChecklist gameId="g-1" sides={SIDES} lineups={props.lineups} disabled={props.disabled} onToggleArrival={vi.fn()} onConfirmSide={vi.fn()} onRosterError={vi.fn()} />,
  );
}

describe('KickoffChecklist — 킥오프 준비', () => {
  beforeEach(() => {
    mocks.useV1TeamGameRoster.mockReset();
    mocks.useV1TeamGameRoster.mockReturnValue(rosterData({ excluded: 0, unavailable: 0, suspended: 0 }));
    mocks.href.value = '/admin/live/l-1/fixtures/f-1/operate';
  });

  it('제목은 킥오프 준비이고 팀마다 도착 확인과 전원 도착 버튼이 함께 있다', () => {
    renderChecklist({ lineups: lineups(NOT_YET, NOT_YET) });

    const section = screen.getByRole('region', { name: '킥오프 준비' });
    expect(within(section).getByRole('button', { name: '레드팀 전원 도착 확인' })).toBeInTheDocument();
    expect(within(section).getByRole('button', { name: '블루팀 전원 도착 확인' })).toBeInTheDocument();
  });

  it('팀마다 그 팀의 사이드로 명단 요약을 조회한다 — 빠짐은 이번 경기 빠짐 + 결장, 정지는 따로', () => {
    mocks.useV1TeamGameRoster.mockImplementation((teamId: string) =>
      teamId === 'team-red'
        ? rosterData({ excluded: 1, unavailable: 1, suspended: 1 })
        : rosterData({ excluded: 0, unavailable: 0, suspended: 0 }),
    );
    renderChecklist({ lineups: lineups(NOT_YET, NOT_YET) });

    expect(mocks.useV1TeamGameRoster).toHaveBeenCalledWith('team-red', 'g-1', { refetchInterval: OPERATIONS_BOARD_POLL_INTERVAL_MS });
    expect(mocks.useV1TeamGameRoster).toHaveBeenCalledWith('team-blue', 'g-1', { refetchInterval: OPERATIONS_BOARD_POLL_INTERVAL_MS });
    expect(screen.getByText('빠짐 2 · 정지 1')).toBeInTheDocument();
    expect(screen.getByText('빠짐 0 · 정지 0')).toBeInTheDocument();
  });

  it('명단 화면 링크는 이 콘솔로 돌아오도록 출처를 싣는다', () => {
    renderChecklist({ lineups: lineups(NOT_YET, NOT_YET) });

    expect(screen.getByRole('link', { name: '레드팀 경기 명단 보기' })).toHaveAttribute(
      'href',
      `/teams/team-red/games/g-1/roster?from=${encodeURIComponent('/admin/live/l-1/fixtures/f-1/operate')}`,
    );
  });

  it('요약을 못 읽은 팀은 못 읽었다고 말한다 — 0 으로 그리지 않고, 다른 팀 요약은 그대로 보인다', () => {
    // 리그 여부는 첫 팀(레드) 명단으로 판정하므로, 요약 실패는 두 번째 팀으로 본다.
    mocks.useV1TeamGameRoster.mockImplementation((teamId: string) =>
      teamId === 'team-blue'
        ? { data: undefined, isPending: false, isError: true }
        : rosterData({ excluded: 0, unavailable: 0, suspended: 2 }),
    );
    renderChecklist({ lineups: lineups(NOT_YET, NOT_YET) });

    expect(screen.getByText('명단 요약을 불러오지 못했어요.')).toBeInTheDocument();
    expect(screen.getByText('빠짐 0 · 정지 2')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '블루팀 경기 명단 보기' })).toBeNull();
  });

  it('리그인지 확인하는 동안에는 대회용 도착 확인을 먼저 그리지 않는다', () => {
    mocks.useV1TeamGameRoster.mockReturnValue({ data: undefined, isPending: true, isError: false });
    renderChecklist({ lineups: lineups(NOT_YET, NOT_YET) });

    expect(screen.getByRole('status')).toHaveTextContent('킥오프 준비를 불러오는 중이에요…');
    expect(screen.queryByRole('button', { name: /전원 도착 확인/ })).toBeNull();
  });

  it('리그인지 확인하지 못하면 도착 확인 대신 오류와 다시 불러오기를 보여 준다', () => {
    const refetch = vi.fn();
    mocks.useV1TeamGameRoster.mockReturnValue({ data: undefined, isPending: false, isError: true, refetch });
    renderChecklist({ lineups: lineups(NOT_YET, NOT_YET) });

    expect(screen.getByRole('alert')).toHaveTextContent('킥오프 준비를 불러오지 못했어요.');
    expect(screen.queryByRole('button', { name: /전원 도착 확인/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('팀이 정해지지 않은 사이드에는 요약도 링크도 없다', () => {
    render(
      <KickoffChecklist
        gameId="g-1"
        sides={[side('side-home', null, '미정')]}
        lineups={[lineup('side-home', [participant('h1', 'side-home', 'lineup-side-home', NOT_YET)])]}
        onToggleArrival={vi.fn()}
        onRosterError={vi.fn()}
      />,
    );

    expect(screen.queryByText(/빠짐/)).toBeNull();
    expect(screen.queryByRole('link', { name: /경기 명단 보기/ })).toBeNull();
  });

  it('전원 도착 확인이 끝나면 준비 완료를 알리고 경기 시작으로 이어 준다', () => {
    renderChecklist({ lineups: lineups(ARRIVED, ARRIVED) });

    expect(screen.getByRole('status')).toHaveTextContent('준비가 끝났어요. ‘경기 시작’을 눌러 주세요.');
  });

  it('미확인이 남았으면 몇 명인지 말하고, 그래도 시작할 수 있다고 알린다 (도착 확인은 시작 조건이 아니다)', () => {
    renderChecklist({ lineups: lineups(ARRIVED, NOT_YET) });

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('도착을 확인하지 못한 선수가 1명 있어요');
    expect(status).toHaveTextContent('그래도 ‘경기 시작’은 누를 수 있어요');
    expect(status).not.toHaveTextContent('준비가 끝났어요');
  });

  it.each([
    ['전원 도착', ARRIVED, '모든 선수의 도착을 확인했어요.'],
    ['미확인 남음', NOT_YET, '아직 도착을 확인하지 못한 선수가 1명 있어요.'],
  ])('경기를 시작할 수 없는 사람(조회 전용 스태프 등)에게는 경기 시작 안내 없이 도착 현황만 말한다 — %s', (_, away, text) => {
    renderChecklist({ lineups: lineups(ARRIVED, away), disabled: true });

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(text);
    expect(status).not.toHaveTextContent('경기 시작');
  });

  it('명단이 없으면 준비 완료 문구를 지어내지 않는다', () => {
    renderChecklist({ lineups: [] });

    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByText('제출된 명단이 없어 검인할 대상이 없어요.')).toBeInTheDocument();
  });

  describe('리그 경기 — 체크 = 출전', () => {
    const leagueRoster = (base: Array<{ userId: string; displayName: string; status: string; realName?: string }>) => ({
      data: {
        sideId: 'side-home',
        competitionKind: 'LEAGUE',
        editable: true,
        base: base.map((player) => ({ ...player, jerseyNumber: null, accountLinked: true, participantId: null })),
        counts: {
          base: base.length,
          participating: base.filter((player) => player.status === 'PARTICIPATING').length,
          excluded: base.filter((player) => player.status === 'EXCLUDED').length,
          unavailable: 0,
          suspended: base.filter((player) => player.status === 'SUSPENDED').length,
        },
      },
      isPending: false,
      isError: false,
    });

    it('도착 확인 대신 팀원 전원이 출전으로 체크돼 있고, 누르면 이번 경기에서 뺀다', async () => {
      mocks.setParticipation.mockReset().mockResolvedValue({});
      mocks.useV1TeamGameRoster.mockReturnValue(leagueRoster([
        { userId: 'u1', displayName: '김선수', status: 'PARTICIPATING' },
        { userId: 'u2', displayName: '이선수', status: 'SUSPENDED' },
      ]));
      renderChecklist({ lineups: lineups(NOT_YET, NOT_YET) });

      expect(screen.queryByRole('button', { name: /전원 도착 확인/ })).toBeNull();
      const kim = screen.getAllByRole('switch', { name: /김선수 — 출전/ })[0];
      expect(kim).toHaveAttribute('aria-checked', 'true');
      expect(screen.getAllByRole('switch', { name: /이선수 — 출전정지/ })[0]).toBeDisabled();

      fireEvent.click(kim);
      await waitFor(() => expect(mocks.setParticipation).toHaveBeenCalledWith({ userId: 'u1', participating: false }));
    });

    it('운영진에게 내려온 실명은 "실명 (닉네임)" 으로 보이고, 실명이 없으면 닉네임 그대로다', () => {
      mocks.useV1TeamGameRoster.mockReturnValue(leagueRoster([
        { userId: 'u1', displayName: '김선수', status: 'PARTICIPATING', realName: '김하나' },
        { userId: 'u2', displayName: '이선수', status: 'PARTICIPATING' },
      ]));
      renderChecklist({ lineups: lineups(NOT_YET, NOT_YET) });

      expect(screen.getAllByText('김하나 (김선수)')[0]).toBeInTheDocument();
      expect(screen.getAllByRole('switch', { name: /^김하나 \(김선수\) — 출전/ })[0]).toBeInTheDocument();
      expect(screen.getAllByText('이선수')[0]).toBeInTheDocument();
      expect(screen.getAllByRole('switch', { name: /^이선수 — 출전/ })[0]).toBeInTheDocument();
    });

    it('뺀 선수가 있으면 전원 출전으로 한 번에 되돌린다', async () => {
      mocks.setParticipation.mockReset().mockResolvedValue({});
      mocks.useV1TeamGameRoster.mockReturnValue(leagueRoster([
        { userId: 'u1', displayName: '김선수', status: 'EXCLUDED' },
        { userId: 'u3', displayName: '박선수', status: 'EXCLUDED' },
      ]));
      renderChecklist({ lineups: lineups(NOT_YET, NOT_YET) });

      fireEvent.click(screen.getByRole('button', { name: '레드팀 전원 출전' }));
      await waitFor(() => expect(mocks.setParticipation).toHaveBeenCalledTimes(2));
      expect(mocks.setParticipation).toHaveBeenNthCalledWith(1, { userId: 'u1', participating: true });
      expect(mocks.setParticipation).toHaveBeenNthCalledWith(2, { userId: 'u3', participating: true });
    });
  });
});
