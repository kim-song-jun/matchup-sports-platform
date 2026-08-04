import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OperateConsole } from './operate-console';
import type { GameEventRecord } from '@/types/game-operations';

/**
 * "기록한 이벤트" 자리에 **로컬 전송 큐**를 그리고 있었다. 큐는 이번 세션에서 내가 올린 것만
 * 담기 때문에, 새로고침하거나 다른 운영자가 넘겨받으면 골이 4개 기록된 경기도
 * "기록된 이벤트가 아직 없어요" 로 보였다 — 화면이 실제 기록을 부정하는 상태였다.
 *
 * 지금은 서버 확정 로그(liveEvents)를 먼저 보여주고, 전송 큐는 대기·실패가 있을 때만
 * "전송 상태" 로 따로 세운다. 둘은 다른 것을 뜻하므로 같은 제목 아래 둘 수 없다.
 */

const mocks = vi.hoisted(() => ({
  useV1AuthMe: vi.fn(),
  useV1FixtureLineup: vi.fn(),
  useV1Game: vi.fn(),
  useV1GameOperationsConsole: vi.fn(),
}));

vi.mock('@/hooks/use-v1-api', () => ({ useV1AuthMe: () => mocks.useV1AuthMe() }));
vi.mock('@/hooks/use-v1-game-operations', () => ({
  useV1FixtureLineup: () => mocks.useV1FixtureLineup(),
  useV1Game: () => mocks.useV1Game(),
  postV1GameCommand: vi.fn(),
}));
vi.mock('@/hooks/use-v1-game-operations-console', () => ({
  useV1GameOperationsConsole: () => mocks.useV1GameOperationsConsole(),
  gameOperationsErrorMessage: (code: string) => `오류(${code})`,
}));
vi.mock('./lineup-grid', () => ({ LineupGrid: () => <div data-testid="lineup-grid" /> }));

const SIDE_ID = 'side-home';

function goal(sequence: number): GameEventRecord {
  return {
    id: `event-${sequence}`,
    gameId: 'game-1',
    sequence,
    clientEventId: `client-${sequence}`,
    payloadHash: 'hash',
    type: 'GOAL',
    sideId: SIDE_ID,
    participantId: 'p-1',
    period: 2,
    clockMs: 6 * 60000,
    occurredAt: '2026-08-04T00:00:00.000Z',
    receivedAt: '2026-08-04T00:00:00.000Z',
    actorUserId: 'actor-1',
    reversesEventId: null,
  } as GameEventRecord;
}

function consoleState(overrides: Record<string, unknown> = {}) {
  return {
    connectionStatus: 'connected',
    sync: { status: 'ok', lastSequence: 1 },
    takeover: { status: 'held', token: 'tok', expiresAtMs: Date.now() + 60000, assignmentVersion: 0 },
    queue: { items: [] },
    clockOffsetMs: 0,
    liveEvents: [goal(1)],
    gameSnapshot: { version: 2, state: 'LIVE' },
    bannerMessage: null,
    submitEvent: vi.fn(),
    retryFailedEvent: vi.fn(),
    requestTakeover: vi.fn(),
    ...overrides,
  };
}

describe('OperateConsole — 기록된 이벤트 / 전송 상태 분리', () => {
  beforeEach(() => {
    mocks.useV1AuthMe.mockReturnValue({ data: { user: { id: 'user-1' } } });
    mocks.useV1FixtureLineup.mockReturnValue({
      data: { gameId: 'game-1', lineups: [{ sideId: SIDE_ID, participants: [
        { id: 'p-1', gameId: 'game-1', sideId: SIDE_ID, lineupId: 'l-1',
          displayNameSnapshot: '정우진', jerseyNumber: 10, position: null,
          createdAt: '', updatedAt: '' },
      ] }] },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    mocks.useV1Game.mockReturnValue({
      data: {
        id: 'game-1', state: 'LIVE', version: 2, lastSequence: 1, periods: [],
        sides: [{ id: SIDE_ID, gameId: 'game-1', sideKey: 'HOME', teamId: null,
          displayNameSnapshot: '강남 풋살 클럽', createdAt: '', updatedAt: '' }],
        lineups: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mocks.useV1GameOperationsConsole.mockReturnValue(consoleState());
  });

  it('서버에 확정된 이벤트를 보여준다 — 로컬 큐가 비어 있어도', () => {
    render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

    const list = screen.getByRole('list', { name: '기록된 이벤트 목록' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(list).toHaveTextContent('정우진');
  });

  // 큐가 비어 있으면 "전송 상태" 절은 아예 나오지 않아야 한다 — 평상시 화면에 빈 패널이
  // 남아 있으면 운영자가 그걸 이벤트 목록으로 오해한다(예전 회귀의 원인).
  it('전송할 것이 없으면 전송 상태 절을 세우지 않는다', () => {
    render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

    expect(screen.queryByText('전송 상태')).toBeNull();
  });

  it('대기·실패한 전송이 있을 때만 전송 상태를 따로 세운다', () => {
    mocks.useV1GameOperationsConsole.mockReturnValue(
      consoleState({
        queue: {
          items: [{
            clientEventId: 'client-9',
            status: 'failed',
            lastError: '이벤트를 기록하지 못했어요.',
            event: { type: 'GOAL', payload: {} },
          }],
        },
      }),
    );

    render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

    expect(screen.getByText('전송 상태')).toBeInTheDocument();
    // 서버 로그는 그대로 남아 있어야 한다 — 큐가 그것을 대체하지 않는다.
    expect(screen.getByRole('list', { name: '기록된 이벤트 목록' })).toBeInTheDocument();
  });
});
