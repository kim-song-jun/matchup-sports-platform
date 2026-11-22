import { act, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameEventRecord, GameLineup, GameSide } from '@/types/game-operations';
import { RedCardPenaltyBanner, type PenaltyNowAnchor } from './red-card-penalty-banner';

const MIN = 60_000;
const T0 = Date.UTC(2026, 10, 22, 0, 0, 0);
const SIDES = [
  { id: 'side-home', displayNameSnapshot: '수용5팀' },
  { id: 'side-away', displayNameSnapshot: '수용6팀' },
] as unknown as GameSide[];
const LINEUPS = [
  { participants: [{ id: 'p-home-1', displayNameSnapshot: '수용5팀장' }, { id: 'p-away-1', displayNameSnapshot: '수용6팀장' }] },
] as unknown as GameLineup[];

function event(
  type: GameEventRecord['type'],
  id: string,
  sideId: string,
  clockMs: number,
  overrides: Partial<GameEventRecord> = {},
): GameEventRecord {
  return {
    id,
    gameId: 'g-1',
    sequence: Number(id.replace(/\D/g, '')) || 1,
    clientEventId: `client-${id}`,
    payloadHash: 'h',
    type,
    sideId,
    participantId: sideId === 'side-home' ? 'p-home-1' : 'p-away-1',
    assistParticipantId: null,
    period: 1,
    clockMs,
    occurredAt: '',
    receivedAt: '',
    actorUserId: 'a',
    reversesEventId: null,
    payload: {},
    ...overrides,
  };
}
const RED = event('CARD', 'e1', 'side-home', 5 * MIN, { payload: { card: 'RED' } });

const live = (overrides: Partial<Extract<PenaltyNowAnchor, { kind: 'live' }>> = {}): PenaltyNowAnchor => ({
  kind: 'live',
  period: 1,
  periodStartedAtMs: T0,
  offsetMs: 0,
  pausedTotalMs: 0,
  pausedAtMs: null,
  ...overrides,
});

function renderBanner(anchor: PenaltyNowAnchor, events: GameEventRecord[] = [RED]) {
  return render(
    <RedCardPenaltyBanner
      events={events}
      queuedItems={[]}
      anchor={anchor}
      periodLengthMs={(period) => (period === 1 || period === 2 ? 20 * MIN : null)}
      sides={SIDES}
      lineups={LINEUPS}
    />,
  );
}

describe('RedCardPenaltyBanner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('"패널티 1:30"과 퇴장한 팀·선수를 보여 주고 매초 줄어든다', () => {
    vi.setSystemTime(T0 + 5 * MIN + 30_000);
    renderBanner(live());

    const list = screen.getByRole('list', { name: '퇴장 패널티' });
    expect(within(list).getByRole('timer')).toHaveTextContent('패널티 1:30');
    expect(list).toHaveTextContent('수용5팀 · 수용5팀장 퇴장');

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByRole('timer')).toHaveTextContent('패널티 1:29');
  });

  it('2분이 다 지나면 줄이 그냥 사라진다', () => {
    vi.setSystemTime(T0 + 6 * MIN + 58_000);
    renderBanner(live());
    expect(screen.getByRole('timer')).toHaveTextContent('패널티 0:02');

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.queryByRole('list', { name: '퇴장 패널티' })).toBeNull();
    expect(screen.queryByRole('timer')).toBeNull();
  });

  it('상대가 득점하면 사라진다', () => {
    vi.setSystemTime(T0 + 5 * MIN + 30_000);
    renderBanner(live(), [RED, event('GOAL', 'e2', 'side-away', 5 * MIN + 20_000)]);

    expect(screen.queryByRole('list', { name: '퇴장 패널티' })).toBeNull();
  });

  it('일시 중지 중에는 숫자가 멈추고 이유를 적는다', () => {
    const pausedAt = T0 + 5 * MIN + 30_000;
    vi.setSystemTime(pausedAt);
    renderBanner(live({ pausedAtMs: pausedAt }));
    expect(screen.getByRole('list', { name: '퇴장 패널티' })).toHaveTextContent('일시 중지 중');

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(screen.getByRole('timer')).toHaveTextContent('패널티 1:30');
  });

  it('하프타임에는 전반이 끝난 시점에 멈춘 값을 보여 준다', () => {
    // 전반 19:30 퇴장 → 전반 끝(20:00)까지 30초가 흘렀다.
    const lateRed = event('CARD', 'e1', 'side-home', 19 * MIN + 30_000, { payload: { card: 'RED' } });
    renderBanner({ kind: 'frozen', period: 1, clockMs: 20 * MIN }, [lateRed]);

    expect(screen.getByRole('timer')).toHaveTextContent('패널티 1:30');
    expect(screen.getByRole('list', { name: '퇴장 패널티' })).toHaveTextContent('하프타임');
  });

  it('퇴장한 선수가 둘이면 두 줄을 남은 시간이 짧은 순서로 보여 준다', () => {
    vi.setSystemTime(T0 + 6 * MIN);
    const awayRed = event('CARD', 'e3', 'side-away', 5 * MIN + 30_000, { payload: { card: 'RED' } });
    renderBanner(live(), [RED, awayRed]);

    const timers = screen.getAllByRole('timer');
    expect(timers.map((el) => el.textContent)).toEqual(['패널티 1:00', '패널티 1:30']);
  });
});
