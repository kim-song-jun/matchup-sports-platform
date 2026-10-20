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
    <KickoffChecklist gameId="g-1" sides={SIDES} disabled={props.disabled} onRosterError={vi.fn()} />,
  );
}

describe('KickoffChecklist — 킥오프 준비', () => {
  beforeEach(() => {
    mocks.useV1TeamGameRoster.mockReset();
    mocks.useV1TeamGameRoster.mockReturnValue(rosterData({ excluded: 0, unavailable: 0, suspended: 0 }));
    mocks.href.value = '/admin/live/l-1/fixtures/f-1/operate';
  });

  it('대회는 도착 검인 대신 팀의 경기 출전 명단을 조회 상태로 보여 준다', () => {
    mocks.useV1TeamGameRoster.mockReturnValue({ data: {
      competitionKind: 'TOURNAMENT', editable: true, base: [], participants: [],
      counts: { base: 0, participating: 0, excluded: 0, unavailable: 0, suspended: 0 },
    }, isPending: false, isError: false });
    renderChecklist({ lineups: [] });
    expect(screen.getByRole('region', { name: '킥오프 준비' })).toHaveTextContent('이번 경기 출전 명단');
    expect(screen.getByRole('button', { name: '레드팀 명단 수정하기' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /전원 도착/ })).toBeNull();
  });

  it('경기 명단 조회 실패는 오류와 재시도로 표시한다', () => {
    const refetch = vi.fn();
    mocks.useV1TeamGameRoster.mockReturnValue({ data: undefined, isError: true, refetch });
    renderChecklist({ lineups: [] });
    expect(screen.getByRole('alert')).toHaveTextContent('불러오지 못했어요');
    fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
    expect(refetch).toHaveBeenCalledTimes(1);
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

    it.each([
      ['운영진(실명 있음)', { realName: '김실명' }, '김실명 (김선수)'],
      ['운영진 — 실명과 닉네임이 같아도 둘 다', { realName: '김선수' }, '김선수 (김선수)'],
      ['권한 없음(realName 키 없음)', {}, '김선수'],
    ])('선수 이름은 운영 콘솔과 같은 규칙이고 자르지 않는다: %s', (_, extra, name) => {
      mocks.useV1TeamGameRoster.mockReturnValue(leagueRoster([{ userId: 'u1', displayName: '김선수', status: 'PARTICIPATING', ...extra }]));
      renderChecklist({ lineups: lineups(NOT_YET, NOT_YET) });

      expect(screen.getAllByRole('switch', { name: `${name} — 출전, 누르면 이번 경기에서 빼요` }).length).toBeGreaterThan(0);
      const label = screen.getAllByText(name)[0];
      expect(label).not.toHaveClass('truncate');
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
