'use client';

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { WifiOff, Wifi } from 'lucide-react';
import { Button } from '@/components/v1-ui/button';
import { useV1AuthMe } from '@/hooks/use-v1-api';
import { useV1FixtureLineup, useV1Game, postV1GameCommand } from '@/hooks/use-v1-game-operations';
import { gameOperationsErrorMessage, useV1GameOperationsConsole } from '@/hooks/use-v1-game-operations-console';
import { isTakeoverHeld } from '@/lib/game-operations-queue';
import { freezeCapture, type FrozenEventCapture } from '@/lib/game-operations-clock';
import { extractErrorMessage } from '@/lib/error-message';
import { randomUuid } from '@/lib/uuid';
import { LineupGrid } from './lineup-grid';
import { EventCaptureModal, type EventCaptureCommitInput } from './event-capture-modal';
import { QueueStatusPanel } from './queue-status-panel';
import type { GameCommandName, GameLineupParticipant, GameState } from '@/types/game-operations';

export interface OperateConsoleProps {
  readonly tournamentId: string;
  readonly fixtureId: string;
}

const STATE_LABEL: Record<GameState, string> = {
  SCHEDULED: '시작 전',
  LIVE: '진행 중',
  PAUSED: '일시 중지',
  ENDED: '종료',
  CANCELLED: '취소됨',
};

const AVAILABLE_COMMANDS: Record<GameState, readonly GameCommandName[]> = {
  SCHEDULED: ['start'],
  LIVE: ['pause', 'end'],
  PAUSED: ['resume', 'end'],
  ENDED: [],
  CANCELLED: [],
};

const COMMAND_LABEL: Record<GameCommandName, string> = {
  start: '경기 시작',
  pause: '일시 중지',
  resume: '재개',
  end: '경기 종료',
};

interface SelectedPlayer {
  readonly sideId: string;
  readonly participant: GameLineupParticipant;
  readonly frozen: FrozenEventCapture;
}

export function OperateConsole({ tournamentId, fixtureId }: OperateConsoleProps) {
  const authMe = useV1AuthMe();
  const myUserId = authMe.data?.user.id;

  const fixtureLineup = useV1FixtureLineup(tournamentId, fixtureId);
  const gameId = fixtureLineup.data?.gameId ?? null;

  const gameDetail = useV1Game(gameId);

  const ops = useV1GameOperationsConsole({
    tournamentId,
    gameId,
    myUserId,
    initialLastSequence: gameDetail.data?.lastSequence ?? 0,
  });

  const [selected, setSelected] = useState<SelectedPlayer | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [commandPending, setCommandPending] = useState(false);

  const gameState = ops.gameSnapshot?.state ?? gameDetail.data?.state ?? null;
  const gameVersion = ops.gameSnapshot?.version ?? gameDetail.data?.version ?? 0;

  const currentPeriod = useMemo(() => {
    const periods = gameDetail.data?.periods ?? [];
    const live = periods.find((period) => period.state === 'LIVE');
    if (live) return live;
    return periods.reduce<typeof periods[number] | null>(
      (latest, period) => (latest === null || period.number > latest.number ? period : latest),
      null,
    );
  }, [gameDetail.data?.periods]);

  const handleSelectPlayer = useCallback(
    (input: { sideId: string; participant: GameLineupParticipant }) => {
      const periodStartedAtMs = currentPeriod?.startedAt
        ? new Date(currentPeriod.startedAt).getTime()
        : Date.now();
      const frozen = freezeCapture({
        clientNowMs: Date.now(),
        offsetMs: ops.clockOffsetMs,
        period: currentPeriod?.number ?? 1,
        periodStartedAtMs,
      });
      setSelected({ sideId: input.sideId, participant: input.participant, frozen });
    },
    [ops.clockOffsetMs, currentPeriod],
  );

  const teammates = useMemo(() => {
    if (!selected) return [];
    const lineups = fixtureLineup.data?.lineups ?? [];
    const lineup = lineups.find((row) => row.sideId === selected.sideId);
    return (lineup?.participants ?? []).filter((participant) => participant.id !== selected.participant.id);
  }, [selected, fixtureLineup.data?.lineups]);

  const handleCommit = useCallback(
    (input: EventCaptureCommitInput) => {
      void ops.submitEvent(input);
      setSelected(null);
    },
    [ops],
  );

  const handleRunCommand = useCallback(
    async (command: GameCommandName) => {
      if (!gameId || !isTakeoverHeld(ops.takeover)) return;
      setCommandPending(true);
      setCommandError(null);
      try {
        await postV1GameCommand(gameId, command, {
          expectedVersion: gameVersion,
          clientCommandId: randomUuid(),
          takeoverToken: ops.takeover.token,
          occurredAt: new Date(Date.now() + ops.clockOffsetMs).toISOString(),
          payload: {},
        });
        await gameDetail.refetch();
      } catch (error) {
        setCommandError(extractErrorMessage(error, '명령을 처리하지 못했어요. 다시 시도해주세요.'));
      } finally {
        setCommandPending(false);
      }
    },
    [gameId, ops, gameVersion, gameDetail],
  );

  if (fixtureLineup.isLoading || (gameId && gameDetail.isLoading)) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-gray-500 dark:text-gray-400">
        불러오는 중이에요…
      </div>
    );
  }

  if (fixtureLineup.isError) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 px-4 text-center">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
          {extractErrorMessage(fixtureLineup.error, '경기 정보를 불러오지 못했어요.')}
        </p>
        <Button size="md" variant="outline" onClick={() => fixtureLineup.refetch()}>
          다시 시도
        </Button>
      </div>
    );
  }

  if (!gameId) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-gray-500 dark:text-gray-400">
        아직 생성된 경기 정보가 없어요.
      </div>
    );
  }

  const sides = gameDetail.data?.sides ?? [];
  const lineups = fixtureLineup.data?.lineups ?? [];
  const availableCommands = gameState ? AVAILABLE_COMMANDS[gameState] : [];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 pb-24">
      {/* Sticky context header — tablet 768×1024 / desktop 1280+ keep this
          visible while scrolling the lineup/queue below. */}
      <header className="sticky top-0 z-10 -mx-4 border-b border-gray-100 bg-white/95 px-4 py-3 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-900/95">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-gray-900 dark:text-white">
              {sides.map((side) => side.displayNameSnapshot).join(' vs ') || '경기 운영'}
            </p>
            <div className="mt-0.5 flex items-center gap-2 text-2xs text-gray-500 dark:text-gray-400">
              <span className="rounded-full bg-blue-50 px-2 py-0.5 font-semibold text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
                {gameState ? STATE_LABEL[gameState] : '-'}
              </span>
              <span className="flex items-center gap-1" aria-live="polite">
                {ops.connectionStatus === 'connected' ? (
                  <Wifi size={13} aria-hidden="true" />
                ) : (
                  <WifiOff size={13} aria-hidden="true" />
                )}
                {ops.connectionStatus === 'connected'
                  ? '실시간 연결됨'
                  : ops.connectionStatus === 'connecting'
                    ? '연결 중…'
                    : '연결 끊김'}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
            {availableCommands.map((command) => (
              <Button
                key={command}
                size="sm"
                variant={command === 'end' ? 'danger' : 'primary'}
                disabled={!isTakeoverHeld(ops.takeover) || commandPending}
                loading={commandPending}
                onClick={() => handleRunCommand(command)}
              >
                {COMMAND_LABEL[command]}
              </Button>
            ))}
          </div>
        </div>
      </header>

      {/* Banners — never silently swallowed; each condition is its own
          visible, dismissable-by-recovery state. */}
      <div className="flex flex-col gap-2 px-4" aria-live="polite">
        {ops.takeover.status === 'revoked' && (
          <Banner tone="warning">
            운영 권한이 해제됐어요. 다른 운영자가 이 경기를 담당하고 있어요.
          </Banner>
        )}
        {ops.takeover.status === 'expired' && (
          <Banner tone="warning">운영 권한을 다시 가져오는 중이에요…</Banner>
        )}
        {ops.takeover.status === 'denied' && (
          /* 거부 사유와 무관하게 "권한이 없어요" 로 고정돼 있었다 — 서버가 실제로는
             granted 를 준 경우까지 권한 문제로 보여, 운영자를 엉뚱한 대응으로 보냈다.
             코드별 문구를 쓰고 코드 자체는 운영 문의용으로 괄호에 남긴다. */
          <Banner tone="danger">
            {gameOperationsErrorMessage(ops.takeover.code)} ({ops.takeover.code})
          </Banner>
        )}
        {ops.sync.status === 'gap' && (
          <Banner tone="info">누락된 기록을 다시 불러오는 중이에요…</Banner>
        )}
        {ops.bannerMessage && <Banner tone="danger">{ops.bannerMessage}</Banner>}
        {commandError && <Banner tone="danger">{commandError}</Banner>}
      </div>

      <div className="px-4">
        <LineupGrid
          sides={sides}
          lineups={lineups}
          onSelectPlayer={handleSelectPlayer}
          disabled={!isTakeoverHeld(ops.takeover)}
        />
      </div>

      <section className="px-4">
        <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">기록한 이벤트</h3>
        <QueueStatusPanel items={ops.queue.items} onRetry={ops.retryFailedEvent} />
      </section>

      {selected && (
        <EventCaptureModal
          open
          sideId={selected.sideId}
          player={selected.participant}
          frozen={selected.frozen}
          teammates={teammates}
          onCommit={handleCommit}
          onCancel={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function Banner({ tone, children }: { tone: 'info' | 'warning' | 'danger'; children: ReactNode }) {
  const toneClass = {
    info: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300',
    warning: 'bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300',
    danger: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300',
  }[tone];
  return (
    <p role={tone === 'danger' ? 'alert' : 'status'} className={`rounded-lg px-3 py-2 text-sm font-medium ${toneClass}`}>
      {children}
    </p>
  );
}
