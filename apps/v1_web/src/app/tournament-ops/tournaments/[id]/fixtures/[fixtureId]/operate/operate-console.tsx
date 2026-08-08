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
import { RecordedEventList } from './recorded-event-list';
import { useEventToast, EventToasts } from '@/components/game-operations/event-toast';
import { findRecentGoalEvent } from '@/lib/find-recent-goal-event';
import type { GameCommandName, GameEventRecord, GameLineupParticipant, GameState } from '@/types/game-operations';

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

const COMMAND_LABEL: Record<Exclude<GameCommandName, 'next-period'>, string> = {
  start: '경기 시작',
  pause: '일시 중지',
  resume: '재개',
  end: '경기 종료',
};

/** `next-period`는 고정 라벨이 없다 — 축구/풋살 모두 정확히 2피리어드(전반/후반,
 * `competition-config.presets.ts`)라 1→2 전이는 항상 "전반 종료"다. 그 이상(향후
 * 다른 종목 config, T1-5 범위)은 잘못된 전/후반 라벨 대신 번호 기반 폴백을 쓴다. */
function nextPeriodCommandLabel(currentPeriodNumber: number): string {
  return currentPeriodNumber === 1 ? '전반 종료' : `${currentPeriodNumber}피리어드 종료`;
}

function commandLabel(command: GameCommandName, currentPeriodNumber: number | null): string {
  if (command === 'next-period') {
    return nextPeriodCommandLabel(currentPeriodNumber ?? 1);
  }
  return COMMAND_LABEL[command];
}

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

  // T1-0: a period only counts as "current" once the server has marked it
  // LIVE (via executeCommand's start/next_period). Falling back to "the
  // highest period number" was the root cause of every captured event
  // landing on the last period at clockMs 0 — see the design doc's §2.8.
  const currentPeriod = useMemo(() => {
    const periods = gameDetail.data?.periods ?? [];
    return periods.find((period) => period.state === 'LIVE') ?? null;
  }, [gameDetail.data?.periods]);

  const hasNextPeriod = useMemo(() => {
    if (currentPeriod === null) return false;
    const periods = gameDetail.data?.periods ?? [];
    return periods.some((period) => period.number === currentPeriod.number + 1);
  }, [currentPeriod, gameDetail.data?.periods]);

  const availableCommands: readonly GameCommandName[] = useMemo(() => {
    switch (gameState) {
      case 'SCHEDULED':
        return ['start'];
      case 'LIVE':
        return hasNextPeriod ? ['pause', 'next-period', 'end'] : ['pause', 'end'];
      case 'PAUSED':
        return ['resume', 'end'];
      default:
        return [];
    }
  }, [gameState, hasNextPeriod]);

  const handleSelectPlayer = useCallback(
    (input: { sideId: string; participant: GameLineupParticipant }) => {
      // T1-0: no LIVE period means there is no server-anchored start time to
      // freeze a capture against. This used to silently fall back to
      // Date.now(), which is exactly why every captured event read
      // clockMs≈0. The persistent "경기를 시작해 주세요." banner already
      // explains why the tap did nothing, so this guard needs no message.
      if (currentPeriod === null || currentPeriod.startedAt === null) return;
      const periodStartedAtMs = new Date(currentPeriod.startedAt).getTime();
      const frozen = freezeCapture({
        clientNowMs: Date.now(),
        offsetMs: ops.clockOffsetMs,
        period: currentPeriod.number,
        periodStartedAtMs,
      });
      setSelected({ sideId: input.sideId, participant: input.participant, frozen });
    },
    [ops.clockOffsetMs, currentPeriod],
  );

  const { toasts, showToast, dismiss } = useEventToast();
  const [assistTarget, setAssistTarget] = useState<{ event: GameEventRecord } | null>(null);

  const handleCommit = useCallback(
    (input: EventCaptureCommitInput) => {
      void ops.submitEvent(input);
      setSelected(null);
      if (input.type === 'GOAL') {
        showToast('골을 기록했어요', {
          action: {
            label: '어시스트 추가',
            onClick: () => {
              const match = findRecentGoalEvent(ops.liveEvents, input);
              if (match) setAssistTarget({ event: match });
            },
          },
        });
      }
    },
    [ops, showToast],
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

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 pb-24">
      {/* Sticky context header — tablet 768×1024 / desktop 1280+ keep this
          visible while scrolling the lineup/queue below. */}
      <header className="sticky top-0 z-10 -mx-4 border-b border-gray-100 bg-white/95 px-4 py-3 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-900/95">
        {/* T1-0: next-period 버튼이 추가되며 LIVE 상태의 버튼이 최대 3개(일시
            중지/전반 종료/경기 종료)가 됐다. 기존 "한 줄에 타이틀+뱃지+버튼"
            레이아웃은 390px 모바일에서 버튼 3개가 shrink-0로 자기 너비를 그대로
            차지해 왼쪽 뱃지·연결상태 영역이 극단적으로 좁아져 "진행 중" 뱃지가
            글자 단위로 세로 줄바꿈되는 회귀를 만들었다(2버튼 상태에서는 재현 안
            됨 — 실측 스크린샷으로 확인). 모바일에서는 타이틀 행과 버튼 행을
            세로로 분리하고, 버튼 행은 필요시 자체적으로 줄바꿈하도록 바꿔
            타이틀/뱃지 쪽 공간을 압박하지 않는다. sm(640px) 이상은 기존 한 줄
            레이아웃을 유지한다(768/1440에서는 문제없이 확인됨). */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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
          <div className="flex flex-wrap gap-1.5 sm:shrink-0 sm:justify-end">
            {availableCommands.map((command) => (
              <Button
                key={command}
                size="sm"
                variant={command === 'end' ? 'danger' : 'primary'}
                disabled={!isTakeoverHeld(ops.takeover) || commandPending}
                loading={commandPending}
                onClick={() => handleRunCommand(command)}
              >
                {commandLabel(command, currentPeriod?.number ?? null)}
              </Button>
            ))}
          </div>
        </div>
      </header>

      {/* Banners — never silently swallowed; each condition is its own
          visible, dismissable-by-recovery state. */}
      <div className="flex flex-col gap-2 px-4" aria-live="polite">
        {currentPeriod === null && gameState !== 'ENDED' && gameState !== 'CANCELLED' && (
          <Banner tone="info">경기를 시작해 주세요.</Banner>
        )}
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
          disabled={!isTakeoverHeld(ops.takeover) || currentPeriod === null}
        />
      </div>

      {/* "기록한 이벤트" 라는 제목 아래에 로컬 전송 큐만 그리고 있었다. 큐는 이번 세션에
          내가 올린 것만 담으므로, 새로고침하거나 다른 운영자가 넘겨받으면 골이 4개
          기록된 경기도 "기록된 이벤트가 아직 없어요" 로 보였다 — 화면이 실제 기록을
          부정하는 상태다. 서버에 확정된 이벤트 로그를 먼저 보여주고, 큐는 아직 전송되지
          않았거나 실패한 것만 따로 세운다(둘은 다른 것을 뜻한다). */}
      <section className="px-4">
        <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">기록된 이벤트</h3>
        <RecordedEventList events={ops.liveEvents} sides={sides} lineups={lineups} />
      </section>

      {ops.queue.items.length > 0 && (
        <section className="px-4">
          <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">전송 상태</h3>
          <QueueStatusPanel items={ops.queue.items} onRetry={ops.retryFailedEvent} />
        </section>
      )}

      {selected && (
        <EventCaptureModal
          open
          sideId={selected.sideId}
          player={selected.participant}
          frozen={selected.frozen}
          onCommit={handleCommit}
          onCancel={() => setSelected(null)}
        />
      )}
      <EventToasts toasts={toasts} onDismiss={dismiss} />
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
