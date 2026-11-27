import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

import type { QueuedGameEvent } from '@/lib/game-operations-queue';
import { ConsoleStatusPanel, type RosterRow } from './console-status-panel';
import { deriveConsoleStatus, type ConsoleStatus, type ConsoleStatusInput } from './console-status';

function statusOf(overrides: Partial<ConsoleStatusInput> = {}): ConsoleStatus {
  return deriveConsoleStatus({
    gameState: 'LIVE',
    leaseRequired: true,
    takeoverEnabled: true,
    sampleMode: false,
    takeover: { status: 'held', token: 'token-1', expiresAtMs: 0, assignmentVersion: 1 },
    handoff: null,
    connection: 'connected',
    offlineCommandAllowed: false,
    canOperate: true,
    syncGap: false,
    behind: false,
    periodExpired: false,
    expiryError: null,
    startBlockedByTeams: false,
    commandError: null,
    bannerMessage: null,
    retryLabel: null,
    queue: { waiting: 0, failed: 0 },
    undo: null,
    endPeriodLabel: '전반 종료',
    gameOperationsErrorMessage: (code) => `안내(${code})`,
    ...overrides,
  });
}

const ROSTER: readonly RosterRow[] = [
  { sideId: 'side-home', label: '홈 · 잠실 레전드', count: 7 },
  { sideId: 'side-away', label: '원정 · 마포 FS', count: 7 },
];

function queuedItem(overrides: Partial<QueuedGameEvent>): QueuedGameEvent {
  return {
    clientEventId: 'client-1',
    gameId: 'game-1',
    expectedVersion: 3,
    event: { type: 'GOAL', period: 1, clockMs: 0, occurredAt: '2026-08-08T00:00:00.000Z', payload: {} },
    payloadHash: 'hash',
    status: 'queued',
    queuedAt: '2026-08-08T00:00:00.000Z',
    attempts: 0,
    lastError: null,
    ackedSequence: null,
    ackedVersion: null,
    ...overrides,
  };
}

function renderPanel({
  status = statusOf(),
  roster = ROSTER,
  items = [],
  actionsDisabled = {},
}: {
  status?: ConsoleStatus;
  roster?: readonly RosterRow[] | null;
  items?: readonly QueuedGameEvent[];
  actionsDisabled?: Parameters<typeof ConsoleStatusPanel>[0]['actionsDisabled'];
} = {}) {
  const actions = { takeover: vi.fn(), retryCommand: vi.fn(), retryExpiry: vi.fn() };
  const onRetry = vi.fn();
  render(
    <ConsoleStatusPanel
      status={status}
      roster={roster}
      queue={{ items, onRetry, disabled: false, isRetryableError: () => true }}
      actions={actions}
      actionsDisabled={actionsDisabled}
    />,
  );
  return { actions, onRetry };
}

describe('ConsoleStatusPanel — 상태 줄', () => {
  it('정상일 때는 status 한 줄이고 자세히 버튼이 44px 이상이다', () => {
    renderPanel();
    const row = screen.getByRole('status');
    expect(row).toHaveTextContent('이 기기에서 기록 중 · 연결됨');
    expect(within(row).getByRole('button', { name: '자세히' })).toHaveClass('min-h-[44px]', 'min-w-[44px]');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('danger 는 alert 로 알린다', () => {
    renderPanel({ status: statusOf({ commandError: '명령을 처리하지 못했어요.' }) });
    expect(screen.getByRole('alert')).toHaveTextContent('요청을 처리하지 못했어요');
  });

  it('한쪽에만 색 띠를 두지 않는다', () => {
    renderPanel({ status: statusOf({ connection: 'disconnected' }) });
    expect(screen.getByRole('status').className).not.toMatch(/border-l|border-2|before:|inset/);
  });

  it.each([
    [
      'takeover',
      {
        takeover: { status: 'denied', code: 'TAKEOVER_HELD', holderName: '김운영' },
        handoff: { code: 'TAKEOVER_HELD', holderName: '김운영' },
      } satisfies Partial<ConsoleStatusInput>,
      '이 기기에서 기록하기',
    ],
    ['retryCommand', { retryLabel: '전반 종료' } satisfies Partial<ConsoleStatusInput>, '같은 요청 재시도'],
    ['retryExpiry', { expiryError: '확인 실패' } satisfies Partial<ConsoleStatusInput>, '종료 상태 다시 확인'],
  ] as const)(
    '1번 항목의 action 버튼은 시트를 열지 않고도 줄 안에서 해당 콜백을 부른다 (%s)',
    (callback, overrides, label) => {
      const { actions } = renderPanel({ status: statusOf(overrides) });
      const button = screen.getByRole('button', { name: label });
      expect(button).toHaveClass('min-h-[44px]');
      fireEvent.click(button);

      expect(actions[callback]).toHaveBeenCalledTimes(1);
      const others = (['takeover', 'retryCommand', 'retryExpiry'] as const).filter((name) => name !== callback);
      for (const name of others) expect(actions[name]).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog')).toBeNull();
    },
  );

  it('잠긴 action 은 눌리지 않는다', () => {
    const { actions } = renderPanel({
      status: statusOf({ retryLabel: '전반 종료' }),
      actionsDisabled: { 'retry-command': true },
    });
    const button = screen.getByRole('button', { name: '같은 요청 재시도' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(actions.retryCommand).not.toHaveBeenCalled();
  });

  it('둘째 이후 항목의 action 은 줄에 없고 시트 안에 있다', () => {
    const { actions } = renderPanel({ status: statusOf({ commandError: '실패', retryLabel: '전반 종료' }) });
    expect(screen.queryByRole('button', { name: '같은 요청 재시도' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '자세히' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '같은 요청 재시도' }));
    expect(actions.retryCommand).toHaveBeenCalledTimes(1);
  });
});

describe('ConsoleStatusPanel — 자세히 시트', () => {
  it('자세히를 누르면 시트에 항목 전부와 고정 줄이 보인다', () => {
    renderPanel({ status: statusOf({ behind: true, connection: 'disconnected', commandError: '명령을 처리하지 못했어요.' }) });
    expect(screen.getByRole('alert')).toHaveTextContent('요청을 처리하지 못했어요 외 2개');

    fireEvent.click(screen.getByRole('button', { name: '자세히' }));
    const sheet = screen.getByRole('dialog', { name: '경기 상태' });
    expect(within(sheet).getByText('지금 확인할 것 3개')).toBeInTheDocument();
    expect(within(sheet).getByText('요청을 처리하지 못했어요')).toBeInTheDocument();
    expect(within(sheet).getByText('명령을 처리하지 못했어요.')).toBeInTheDocument();
    expect(within(sheet).getByText('연결이 끊겼어요')).toBeInTheDocument();
    expect(within(sheet).getByText('최신 경기 상태를 확인하고 있어요')).toBeInTheDocument();

    expect(within(sheet).getByText('연결').nextElementSibling).toHaveTextContent('끊겼어요');
    expect(within(sheet).getByText('기록하는 기기').nextElementSibling).toHaveTextContent('이 기기');
    const roster = within(sheet).getByText('출전 명단').nextElementSibling as HTMLElement;
    expect(roster).toHaveTextContent('홈 · 잠실 레전드 7명');
    expect(roster).toHaveTextContent('원정 · 마포 FS 7명');
  });

  it('queue 항목 시트에 전송 실패 줄과 「다시 시도」', () => {
    const items = [
      queuedItem({ clientEventId: 'failed-1', status: 'failed', lastError: { code: 'SEND_TIMEOUT', message: '서버 응답이 늦어요.' } }),
      queuedItem({ clientEventId: 'acked-1', status: 'acked' }),
    ];
    const { onRetry } = renderPanel({ status: statusOf({ queue: { waiting: 0, failed: 1 } }), items });
    expect(screen.getByRole('alert')).toHaveTextContent('기록 1개를 보내지 못했어요');

    fireEvent.click(screen.getByRole('button', { name: '자세히' }));
    const sheet = screen.getByRole('dialog', { name: '경기 상태' });
    expect(within(sheet).getByRole('list', { name: '전송 대기·실패한 기록 목록' })).toBeInTheDocument();
    expect(within(sheet).getByText('전송 실패')).toBeInTheDocument();
    expect(within(sheet).getByText('서버 응답이 늦어요.')).toBeInTheDocument();
    fireEvent.click(within(sheet).getByRole('button', { name: '다시 시도' }));
    expect(onRetry).toHaveBeenCalledWith('failed-1');
  });

  it('보낼 기록이 없으면 전송 목록을 그리지 않는다', () => {
    renderPanel({ items: [queuedItem({ status: 'acked' })] });
    fireEvent.click(screen.getByRole('button', { name: '자세히' }));
    expect(within(screen.getByRole('dialog')).queryByText('보낼 기록')).toBeNull();
    expect(within(screen.getByRole('dialog')).queryByText('모두 서버에 기록됐어요.')).toBeNull();
  });

  it('roster 가 null 이면 출전 명단 줄이 없고, 0명 팀 문구가 보인다', () => {
    const { unmount } = render(
      <ConsoleStatusPanel
        status={statusOf({ gameState: 'SCHEDULED' })}
        roster={null}
        queue={{ items: [], onRetry: vi.fn(), disabled: false, isRetryableError: () => true }}
        actions={{ takeover: vi.fn(), retryCommand: vi.fn(), retryExpiry: vi.fn() }}
        actionsDisabled={{}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '자세히' }));
    expect(within(screen.getByRole('dialog')).queryByText('출전 명단')).toBeNull();
    unmount();

    renderPanel({
      roster: [
        { sideId: 'side-home', label: '홈 · 잠실 레전드', count: 3 },
        { sideId: 'side-away', label: '원정 · 마포 FS', count: 0 },
      ],
    });
    fireEvent.click(screen.getByRole('button', { name: '자세히' }));
    const roster = within(screen.getByRole('dialog')).getByText('출전 명단').nextElementSibling as HTMLElement;
    expect(roster).toHaveTextContent('홈 · 잠실 레전드 3명');
    expect(roster).toHaveTextContent('원정 · 마포 FS 0명 · 선수 모름으로만 기록할 수 있어요');
    expect(screen.queryByText(/익명으로만/)).toBeNull();
  });

  it('정상일 때도 자세히가 열린다', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: '자세히' }));
    const sheet = screen.getByRole('dialog', { name: '경기 상태' });
    expect(within(sheet).getByText('지금 확인할 것이 없어요')).toBeInTheDocument();
    expect(within(sheet).getByText('연결').nextElementSibling).toHaveTextContent('연결됨');

    fireEvent.click(within(sheet).getByRole('button', { name: '닫기' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('기록 권한을 한 기기만 쥐는 경기가 아니면 기록하는 기기 줄이 없다', () => {
    renderPanel({ status: statusOf({ leaseRequired: false, takeover: { status: 'none' } }) });
    fireEvent.click(screen.getByRole('button', { name: '자세히' }));
    expect(within(screen.getByRole('dialog')).queryByText('기록하는 기기')).toBeNull();
  });
});
