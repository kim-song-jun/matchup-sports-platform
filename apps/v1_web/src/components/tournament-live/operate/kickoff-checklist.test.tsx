import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameLineup, GameLineupParticipant, GameSide } from '@/types/game-operations';
import { KickoffChecklist } from './kickoff-checklist';

const mocks = vi.hoisted(() => ({
  useV1TeamGameRoster: vi.fn(),
  href: { value: '/admin/live/l-1/fixtures/f-1/operate' as string | null },
}));

vi.mock('@/hooks/use-v1-game-roster', () => ({
  useV1TeamGameRoster: (...args: unknown[]) => mocks.useV1TeamGameRoster(...args),
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

function renderChecklist(props: { lineups: GameLineup[] }) {
  return render(
    <KickoffChecklist gameId="g-1" sides={SIDES} lineups={props.lineups} onToggleArrival={vi.fn()} onConfirmSide={vi.fn()} />,
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

    expect(mocks.useV1TeamGameRoster).toHaveBeenCalledWith('team-red', 'g-1');
    expect(mocks.useV1TeamGameRoster).toHaveBeenCalledWith('team-blue', 'g-1');
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
    mocks.useV1TeamGameRoster.mockImplementation((teamId: string) =>
      teamId === 'team-red'
        ? { data: undefined, isPending: false, isError: true }
        : rosterData({ excluded: 0, unavailable: 0, suspended: 2 }),
    );
    renderChecklist({ lineups: lineups(NOT_YET, NOT_YET) });

    expect(screen.getByText('명단 요약을 불러오지 못했어요.')).toBeInTheDocument();
    expect(screen.getByText('빠짐 0 · 정지 2')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '레드팀 경기 명단 보기' })).toBeNull();
  });

  it('팀이 정해지지 않은 사이드에는 요약도 링크도 없다', () => {
    render(
      <KickoffChecklist
        gameId="g-1"
        sides={[side('side-home', null, '미정')]}
        lineups={[lineup('side-home', [participant('h1', 'side-home', 'lineup-side-home', NOT_YET)])]}
        onToggleArrival={vi.fn()}
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

  it('명단이 없으면 준비 완료 문구를 지어내지 않는다', () => {
    renderChecklist({ lineups: [] });

    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByText('제출된 명단이 없어 검인할 대상이 없어요.')).toBeInTheDocument();
  });
});
