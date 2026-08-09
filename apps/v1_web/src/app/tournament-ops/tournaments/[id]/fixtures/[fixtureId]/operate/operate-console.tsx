'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { WifiOff, Wifi, Goal, AlertTriangle, ArrowLeftRight } from 'lucide-react';
import { Button } from '@/components/v1-ui/button';
import { useV1AuthMe } from '@/hooks/use-v1-api';
import { useV1FixtureLineup, useV1Game, postV1GameCommand } from '@/hooks/use-v1-game-operations';
import { gameOperationsErrorMessage, useV1GameOperationsConsole } from '@/hooks/use-v1-game-operations-console';
import { isTakeoverHeld } from '@/lib/game-operations-queue';
import { freezeCapture, type FrozenEventCapture } from '@/lib/game-operations-clock';
import { extractErrorMessage } from '@/lib/error-message';
import { randomUuid } from '@/lib/uuid';
import { ActionTargetPicker, type EventCaptureCommitInput } from './action-target-picker';
import { ElapsedMatchClock } from './elapsed-match-clock';
import { QueueStatusPanel } from './queue-status-panel';
import { RecordedEventList } from './recorded-event-list';
import { AssistPickerSheet } from './assist-picker-sheet';
import { QuickSubstitutionPanel } from './quick-substitution-panel';
import { useEventToast, EventToasts } from '@/components/game-operations/event-toast';
import { findRecentGoalEvent } from '@/lib/find-recent-goal-event';
import { findRecentSubstitutionEvent } from '@/lib/find-recent-substitution-event';
import { deriveFoulCounts } from '@/lib/team-foul-counter';
import { deriveOnPitchParticipantIds, countActiveSubstitutions } from '@/lib/on-pitch-state';
import { TeamFoulCounterBar } from '@/components/game-operations/team-foul-counter-bar';
import type {
  GameCardColor,
  GameCommandName,
  GameEventRecord,
  GameEventType,
  GameLineup,
  GameLineupParticipant,
  GameState,
} from '@/types/game-operations';

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

/**
 * 액션 우선 리오더 — 예전엔 "선수 탭"이 이 상태를 만들었다(선수+시각 고정).
 * 지금은 "액션 탭"이 만든다: 액션과 시각이 먼저 고정되고, 그다음 화면
 * (`ActionTargetPicker`)에서 "누구"를 고른다. `frozen`은 액션을 누른 그 순간
 * 값이고, 선수를 고르는 동안 다시 얼리지 않는다 — 그게 이 리오더의 요건이다.
 */
interface PendingAction {
  readonly actionType: GameEventType;
  readonly actionLabel: string;
  readonly cardColor?: GameCardColor;
  /** FOUL만 선수 없이 팀 단위로 기록하는 경로를 연다 — GOAL은 대회의
   * `tournamentScorerPolicy`에 따라 득점자가 강제될 수 있어(백엔드
   * `SCORER_REQUIRED`) 프런트가 임의로 "선수 없이" 옵션을 주면 안 된다. */
  readonly allowTeamOnly: boolean;
  readonly frozen: FrozenEventCapture;
}

const ACTION_BUTTONS: ReadonlyArray<{
  readonly type: GameEventType;
  readonly label: string;
  readonly cardColor?: GameCardColor;
  readonly allowTeamOnly: boolean;
}> = [
  { type: 'GOAL', label: '골', allowTeamOnly: false },
  { type: 'CARD', label: '옐로카드', cardColor: 'YELLOW', allowTeamOnly: false },
  { type: 'CARD', label: '레드카드', cardColor: 'RED', allowTeamOnly: false },
  { type: 'FOUL', label: '파울', allowTeamOnly: true },
  // 선수 교체 — allowTeamOnly는 항상 false다: 나갈 선수/들어올 선수 둘 다
  // 반드시 지정해야 하고(백엔드 assertSubstitution이 강제), "선수 지정 없이"
  // 경로는 이 이벤트 타입에 의미가 없다.
  { type: 'SUBSTITUTION', label: '교체', allowTeamOnly: false },
];

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

  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [commandPending, setCommandPending] = useState(false);
  // "재개/경기종료할 때 얼마나 걸렸는지" — 실측 사고에서 나온 요구. 명령 왕복
  // 지연은 커맨드마다 눈에 띄게 다를 수 있고(네트워크/DB 락 경합), 평소엔
  // 보이지 않던 값이라 ms 단위로 보여줄 가치가 있다 — `formatMatchClock`이
  // 초 단위로 고정한 매치 클록/이벤트 목록과는 다른 결의 숫자라 여기서만 ms를 쓴다.
  const [lastCommandFeedback, setLastCommandFeedback] = useState<{
    readonly label: string;
    readonly durationMs: number;
  } | null>(null);

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

  const foulCounts = useMemo(
    () => deriveFoulCounts(ops.liveEvents, currentPeriod?.number ?? 1),
    [ops.liveEvents, currentPeriod?.number],
  );

  // 선수 교체: "지금 피치 위" 는 저장된 컬럼이 아니라 started + 확정 SUBSTITUTION
  // 이벤트를 접은 파생값이다(요건 3) — ActionTargetPicker의 1단계(나갈 선수)/
  // 2단계(들어올 선수) 필터와 빠른 교체 모드 양쪽이 이 하나의 계산을 공유한다.
  const allParticipants = useMemo(
    () => (fixtureLineup.data?.lineups ?? []).flatMap((lineup) => lineup.participants),
    [fixtureLineup.data?.lineups],
  );
  const onPitchParticipantIds = useMemo(
    () => deriveOnPitchParticipantIds(allParticipants, ops.liveEvents),
    [allParticipants, ops.liveEvents],
  );
  const substitutionUsedBySideId = useMemo(() => {
    const bySide: Record<string, number> = {};
    for (const side of gameDetail.data?.sides ?? []) {
      bySide[side.id] = countActiveSubstitutions(side.id, ops.liveEvents);
    }
    return bySide;
  }, [gameDetail.data?.sides, ops.liveEvents]);
  const [quickSubstitutionMode, setQuickSubstitutionMode] = useState(false);

  const handleSelectAction = useCallback(
    (button: (typeof ACTION_BUTTONS)[number]) => {
      // T1-0: no LIVE period means there is no server-anchored start time to
      // freeze a capture against. This used to silently fall back to
      // Date.now(), which is exactly why every captured event read
      // clockMs≈0. The persistent "경기를 시작해 주세요." banner already
      // explains why the tap did nothing, so this guard needs no message.
      if (currentPeriod === null || currentPeriod.startedAt === null) return;
      const periodStartedAtMs = new Date(currentPeriod.startedAt).getTime();
      // 액션 우선 리오더의 핵심: 여기서 얼린다 — "누구"를 고르는 다음 화면이
      // 아무리 오래 열려 있어도 이 값은 다시 계산되지 않는다.
      const frozen = freezeCapture({
        clientNowMs: Date.now(),
        offsetMs: ops.clockOffsetMs,
        period: currentPeriod.number,
        periodStartedAtMs,
        pausedTotalMs: currentPeriod.pausedTotalMs,
        pausedAtMs: currentPeriod.pausedAt === null ? null : new Date(currentPeriod.pausedAt).getTime(),
      });
      setPendingAction({
        actionType: button.type,
        actionLabel: button.label,
        cardColor: button.cardColor,
        allowTeamOnly: button.allowTeamOnly,
        frozen,
      });
    },
    [ops.clockOffsetMs, currentPeriod],
  );

  const { toasts, showToast, dismiss } = useEventToast();
  const [assistTarget, setAssistTarget] = useState<{ event: GameEventRecord } | null>(null);

  // Copilot review (PR #276): the toast's action.onClick used to close over
  // `ops.liveEvents` from the render that submitted the GOAL -- before the
  // websocket/query round-trip lands that event in liveEvents. The toast
  // itself is never re-created once shown, so that closure stayed stale for
  // its whole 5s lifetime and findRecentGoalEvent almost always returned
  // undefined ("어시스트 추가" silently did nothing). A ref kept in sync via
  // effect lets the onClick read the live value at click time instead.
  const liveEventsRef = useRef(ops.liveEvents);
  useEffect(() => {
    liveEventsRef.current = ops.liveEvents;
  }, [ops.liveEvents]);

  const handleCommit = useCallback(
    (input: EventCaptureCommitInput) => {
      void ops.submitEvent(input);
      setPendingAction(null);
      // GOAL은 이 콘솔에서 항상 참가자를 선택해 커밋한다(`ActionTargetPicker`가
      // GOAL에는 `allowTeamOnly`를 열어주지 않는다) — `participantId`가 정말 없는
      // 경우는 findRecentGoalEvent 자체가 매칭할 수 없으므로 어시스트 추가 액션을
      // 달지 않는다(고아 토스트 액션을 만들지 않기 위한 방어적 가드).
      if (input.type === 'GOAL' && input.participantId !== undefined) {
        const participantId = input.participantId;
        const clockMs = input.clockMs;
        showToast('골을 기록했어요', {
          action: {
            label: '어시스트 추가',
            onClick: () => {
              const match = findRecentGoalEvent(liveEventsRef.current, { participantId, clockMs });
              if (match) setAssistTarget({ event: match });
            },
          },
        });
      }
    },
    [ops, showToast],
  );

  const attachAssist = useCallback(
    async (event: GameEventRecord, assistParticipantId: string) => {
      await ops.reverseEvent({ eventId: event.id, reason: '어시스트 사후 기록' });
      await ops.submitEvent({
        type: 'GOAL',
        sideId: event.sideId ?? undefined,
        participantId: event.participantId ?? undefined,
        assistParticipantId,
        period: event.period,
        clockMs: event.clockMs,
        occurredAt: event.occurredAt,
        payload: {},
      });
    },
    [ops],
  );

  // 빠른 교체 모드의 단일 확정 탭 — QuickSubstitutionPanel은 "지정 후 탭"
  // 두 단계를 거쳐서만 이 콜백을 부르므로(오조작 방지 설계는 그 컴포넌트
  // 문서 참고), 여기서는 시각을 이 탭 순간에 얼리고 바로 커밋한 뒤 되돌리기
  // 액션이 달린 확인 토스트를 띄운다 — 기존 `ops.reverseEvent`(CORRECTION)
  // 경로를 그대로 재사용한다(새 되돌리기 API를 만들지 않는다).
  const handleQuickSubstitute = useCallback(
    (input: { sideId: string; outParticipant: GameLineupParticipant; inParticipant: GameLineupParticipant }) => {
      if (currentPeriod === null || currentPeriod.startedAt === null) return;
      const periodStartedAtMs = new Date(currentPeriod.startedAt).getTime();
      const frozen = freezeCapture({
        clientNowMs: Date.now(),
        offsetMs: ops.clockOffsetMs,
        period: currentPeriod.number,
        periodStartedAtMs,
        pausedTotalMs: currentPeriod.pausedTotalMs,
        pausedAtMs: currentPeriod.pausedAt === null ? null : new Date(currentPeriod.pausedAt).getTime(),
      });
      void ops.submitEvent({
        type: 'SUBSTITUTION',
        participantId: input.inParticipant.id,
        sideId: input.sideId,
        period: frozen.period,
        clockMs: frozen.clockMs,
        occurredAt: frozen.occurredAt,
        payload: { outParticipantId: input.outParticipant.id },
      });
      const outParticipantId = input.outParticipant.id;
      const inParticipantId = input.inParticipant.id;
      const clockMs = frozen.clockMs;
      showToast(`${input.outParticipant.displayNameSnapshot} → ${input.inParticipant.displayNameSnapshot} 교체 기록됨`, {
        action: {
          label: '되돌리기',
          onClick: () => {
            const match = findRecentSubstitutionEvent(liveEventsRef.current, {
              inParticipantId,
              outParticipantId,
              clockMs,
            });
            if (match) void ops.reverseEvent({ eventId: match.id, reason: '빠른 교체 되돌리기' });
          },
        },
      });
    },
    [currentPeriod, ops, showToast],
  );

  const handleRunCommand = useCallback(
    async (command: GameCommandName) => {
      if (!gameId || !isTakeoverHeld(ops.takeover)) return;
      setCommandPending(true);
      setCommandError(null);
      setLastCommandFeedback(null);
      // 라벨은 실행 "전" currentPeriod 기준으로 미리 굳혀둔다 — next-period 명령이
      // 성공하면 refetch 후 currentPeriod가 바로 다음 피리어드로 바뀌어서, 완료 후에
      // 다시 계산하면 "방금 무엇을 끝냈는지"가 아니라 "다음에 뭘 할 수 있는지"로
      // 라벨이 뒤바뀐다.
      const label = commandLabel(command, currentPeriod?.number ?? null);
      const startedAtMs = performance.now();
      try {
        await postV1GameCommand(gameId, command, {
          expectedVersion: gameVersion,
          clientCommandId: randomUuid(),
          takeoverToken: ops.takeover.token,
          occurredAt: new Date(Date.now() + ops.clockOffsetMs).toISOString(),
          payload: {},
        });
        await gameDetail.refetch();
        setLastCommandFeedback({ label, durationMs: Math.round(performance.now() - startedAtMs) });
      } catch (error) {
        setCommandError(extractErrorMessage(error, '명령을 처리하지 못했어요. 다시 시도해주세요.'));
      } finally {
        setCommandPending(false);
      }
    },
    [gameId, ops, gameVersion, gameDetail, currentPeriod],
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
          <div className="flex flex-col items-end gap-1 sm:shrink-0">
            <div className="flex flex-wrap justify-end gap-1.5">
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
            {/* "재개/경기종료할 때 얼마나 걸렸는지" — 실측 사고에서 나온 요구.
                방금 실행한 명령에만 붙는 일회성 피드백이라 다음 명령을 누르는
                순간(`setLastCommandFeedback(null)`) 사라진다. */}
            {lastCommandFeedback ? (
              <p className="text-2xs tabular-nums text-gray-400 dark:text-gray-500" aria-live="polite">
                {lastCommandFeedback.label} 완료 · {lastCommandFeedback.durationMs}ms
              </p>
            ) : null}
          </div>
        </div>
        {currentPeriod && currentPeriod.startedAt ? (
          <div className="mt-2">
            <ElapsedMatchClock
              periodNumber={currentPeriod.number}
              periodStartedAtMs={new Date(currentPeriod.startedAt).getTime()}
              offsetMs={ops.clockOffsetMs}
              pausedTotalMs={currentPeriod.pausedTotalMs}
              pausedAtMs={currentPeriod.pausedAt === null ? null : new Date(currentPeriod.pausedAt).getTime()}
            />
          </div>
        ) : null}
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

      <TeamFoulCounterBar sides={sides} counts={foulCounts} period={currentPeriod?.number ?? 1} />

      {/* 액션 우선 리오더: 이 자리는 예전엔 탭 가능한 선수 그리드였다(선수 먼저 →
          액션). 지금은 액션이 먼저이므로, 그 다음 조작이 실제로 일어나는 자리가
          정확히 이 위치를 차지해야 한다 — 그래서 선수 그리드가 아니라 액션 버튼이
          이 자리를 채운다(요소를 없앤 게 아니라 같은 자리의 진입점을 바꾼 것).
          "누구"를 고르는 단계는 `ActionTargetPicker` 모달에서 처리한다. */}
      <div className="grid grid-cols-2 gap-2 px-4 sm:grid-cols-4">
        {ACTION_BUTTONS.map((button, index) => (
          <Button
            key={`${button.type}-${button.cardColor ?? index}`}
            size="lg"
            variant={
              button.type === 'GOAL'
                ? 'success'
                : button.cardColor === 'YELLOW'
                  ? 'warning'
                  : button.cardColor === 'RED'
                    ? 'danger'
                    : 'neutral'
            }
            className="h-16 flex-col gap-1"
            disabled={!isTakeoverHeld(ops.takeover) || currentPeriod === null}
            onClick={() => handleSelectAction(button)}
          >
            {button.type === 'GOAL' ? (
              <Goal size={18} aria-hidden="true" />
            ) : button.type === 'FOUL' ? (
              <AlertTriangle size={18} aria-hidden="true" />
            ) : button.type === 'SUBSTITUTION' ? (
              <ArrowLeftRight size={18} aria-hidden="true" />
            ) : (
              <span
                aria-hidden="true"
                className={`block h-4 w-3 rounded-[2px] ${button.cardColor === 'RED' ? 'bg-red-200' : 'bg-yellow-300'}`}
              />
            )}
            {button.label}
          </Button>
        ))}
      </div>

      {/* 풋살 등 롤링 교체 종목 전용 — 하드코딩된 종목명이 아니라
          `substitutionPolicy.mode`(config 값)로만 노출 여부를 판단한다(요건 B).
          기본 `교체` 액션(액션 우선 2단계)은 이 종목에서도 항상 그대로 쓸 수
          있다 — 이 토글은 그 위에 얹는 선택적 빠른 경로다. */}
      {gameDetail.data?.substitutionPolicy?.mode === 'rolling' && (
        <div className="flex flex-col gap-2 px-4">
          <Button
            size="sm"
            variant={quickSubstitutionMode ? 'primary' : 'outline'}
            className="self-start"
            disabled={!isTakeoverHeld(ops.takeover) || currentPeriod === null}
            onClick={() => setQuickSubstitutionMode((current) => !current)}
            aria-pressed={quickSubstitutionMode}
          >
            <ArrowLeftRight size={14} aria-hidden="true" />
            빠른 교체 모드 {quickSubstitutionMode ? '끄기' : '켜기'}
          </Button>
          {quickSubstitutionMode && (
            <QuickSubstitutionPanel
              sides={sides}
              lineups={lineups}
              onPitchParticipantIds={onPitchParticipantIds}
              disabled={!isTakeoverHeld(ops.takeover) || currentPeriod === null}
              onSubstitute={handleQuickSubstitute}
            />
          )}
        </div>
      )}

      {/* "기록한 이벤트" 라는 제목 아래에 로컬 전송 큐만 그리고 있었다. 큐는 이번 세션에
          내가 올린 것만 담으므로, 새로고침하거나 다른 운영자가 넘겨받으면 골이 4개
          기록된 경기도 "기록된 이벤트가 아직 없어요" 로 보였다 — 화면이 실제 기록을
          부정하는 상태다. 서버에 확정된 이벤트 로그를 먼저 보여주고, 큐는 아직 전송되지
          않았거나 실패한 것만 따로 세운다(둘은 다른 것을 뜻한다). */}
      <section className="px-4">
        <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">기록된 이벤트</h3>
        <RecordedEventList
          events={ops.liveEvents}
          sides={sides}
          lineups={lineups}
          onAttachAssist={(event) => setAssistTarget({ event })}
          onReverseSubstitution={(event) => void ops.reverseEvent({ eventId: event.id, reason: '교체 되돌리기' })}
        />
      </section>

      {ops.queue.items.length > 0 && (
        <section className="px-4">
          <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">전송 상태</h3>
          <QueueStatusPanel items={ops.queue.items} onRetry={ops.retryFailedEvent} />
        </section>
      )}

      {pendingAction && (
        <ActionTargetPicker
          open
          actionLabel={pendingAction.actionLabel}
          actionType={pendingAction.actionType}
          cardColor={pendingAction.cardColor}
          frozen={pendingAction.frozen}
          sides={sides}
          lineups={lineups}
          allowTeamOnly={pendingAction.allowTeamOnly}
          onPitchParticipantIds={onPitchParticipantIds}
          substitutionPolicy={gameDetail.data?.substitutionPolicy ?? null}
          substitutionUsedBySideId={substitutionUsedBySideId}
          onCommit={handleCommit}
          onCancel={() => setPendingAction(null)}
        />
      )}
      {assistTarget ? (
        <AssistPickerSheet
          open
          event={assistTarget.event}
          scorerName={playerLabel(assistTarget.event.participantId, lineups)}
          teammates={teammatesForSide(assistTarget.event.sideId, lineups, assistTarget.event.participantId)}
          onAttach={(assistParticipantId) => attachAssist(assistTarget.event, assistParticipantId)}
          onClose={() => setAssistTarget(null)}
        />
      ) : null}
      <EventToasts toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

function playerLabel(participantId: string | null, lineups: readonly GameLineup[]): string {
  if (participantId === null) return '선수';
  for (const lineup of lineups) {
    const participant = lineup.participants.find((row) => row.id === participantId);
    if (participant) return participant.displayNameSnapshot;
  }
  return '선수';
}

function teammatesForSide(
  sideId: string | null,
  lineups: readonly GameLineup[],
  excludeParticipantId: string | null,
): readonly GameLineupParticipant[] {
  if (sideId === null) return [];
  const lineup = lineups.find((row) => row.sideId === sideId);
  return (lineup?.participants ?? []).filter((participant) => participant.id !== excludeParticipantId);
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
