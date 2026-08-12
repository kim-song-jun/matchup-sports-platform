'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  WifiOff,
  Wifi,
  Goal,
  AlertTriangle,
  ArrowLeftRight,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  Square,
  Timer,
} from 'lucide-react';
import { Button } from '@/components/v1-ui/button';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { useV1AuthMe } from '@/hooks/use-v1-api';
import { useV1FixtureLineup, useV1Game, postV1GameCommand } from '@/hooks/use-v1-game-operations';
import { gameOperationsErrorMessage, useV1GameOperationsConsole } from '@/hooks/use-v1-game-operations-console';
import { isTakeoverHeld } from '@/lib/game-operations-queue';
import {
  freezeCapture,
  formatMatchClock,
  isClockSuspicious,
  type FrozenEventCapture,
} from '@/lib/game-operations-clock';
import { extractErrorMessage } from '@/lib/error-message';
import { randomUuid } from '@/lib/uuid';
import { ActionTargetPicker, type EventCaptureCommitInput } from './action-target-picker';
import { latestOperableLineup } from './lineup-grid';
import { ElapsedMatchClock } from './elapsed-match-clock';
import { QueueStatusPanel } from './queue-status-panel';
import { RecordedEventList } from './recorded-event-list';
import { AssistPickerSheet } from './assist-picker-sheet';
import { QuickSubstitutionPanel } from './quick-substitution-panel';
import { RestTimer } from './rest-timer';
import { useEventToast, EventToasts } from '@/components/game-operations/event-toast';
import { findRecentGoalEvent } from '@/lib/find-recent-goal-event';
import { findRecentSubstitutionEvent } from '@/lib/find-recent-substitution-event';
import { deriveFoulCounts } from '@/lib/team-foul-counter';
import { deriveOnPitchParticipantIds, countActiveSubstitutions } from '@/lib/on-pitch-state';
import { TeamFoulCounterBar } from '@/components/game-operations/team-foul-counter-bar';
import { periodLabel } from './period-label';
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

const COMMAND_LABEL: Record<
  Exclude<GameCommandName, 'end-period' | 'start-period' | 'revert-period'>,
  string
> = {
  start: '경기 시작',
  pause: '일시 중지',
  resume: '재개',
  end: '경기 종료',
};

/** `end-period`/`start-period`는 고정 라벨이 없다 — 화면 전체가 공유하는
 * `periodLabel`(UX 감사 item 4)을 그대로 써서 "전반 종료"/"후반 시작"/
 * "N피리어드 종료"를 만든다(이슈 #375: 구 `nextPeriodCommandLabel` 하나가
 * 종료+시작 라벨을 겸했던 것을 명령이 둘로 나뉜 만큼 함수도 나눈다). */
function endPeriodCommandLabel(currentPeriodNumber: number): string {
  return `${periodLabel(currentPeriodNumber)} 종료`;
}

/** `nextPeriodNumber`는 지금 HALFTIME인 피리어드의 번호다(halftimePeriod?.
 * number) — currentPeriod(=LIVE 피리어드)가 아니다, 하프타임 중엔 LIVE인
 * 피리어드가 없기 때문이다. */
function startPeriodCommandLabel(nextPeriodNumber: number): string {
  return `${periodLabel(nextPeriodNumber)} 시작`;
}

function commandLabel(
  command: GameCommandName,
  currentPeriodNumber: number | null,
  nextPeriodNumber: number | null,
): string {
  if (command === 'end-period') {
    return endPeriodCommandLabel(currentPeriodNumber ?? 1);
  }
  if (command === 'start-period') {
    return startPeriodCommandLabel(nextPeriodNumber ?? 2);
  }
  if (command === 'revert-period') {
    return '되돌리기';
  }
  return COMMAND_LABEL[command];
}

/** 명령 버튼 재설계 — 색 하나로만 구분되던 걸(전부 알약 3개) 아이콘까지
 * 더해 한눈에 "무슨 동작인지"를 알 수 있게 한다. 위험도(경기 종료) 자체의
 * 구분은 아이콘이 아니라 색+구분선(아래 렌더 부분)이 계속 맡는다 — 아이콘은
 * 여기서 "정지/재생/다음/멈춤/되돌리기"의 의미만 보탠다. */
const COMMAND_ICON: Record<GameCommandName, typeof Pause> = {
  start: Play,
  pause: Pause,
  resume: Play,
  'end-period': SkipForward,
  'start-period': Play,
  'revert-period': RotateCcw,
  end: Square,
};

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
  // LIVE (via executeCommand's start/start-period). Falling back to "the
  // highest period number" was the root cause of every captured event
  // landing on the last period at clockMs 0 — see the design doc's §2.8.
  const currentPeriod = useMemo(() => {
    const periods = gameDetail.data?.periods ?? [];
    return periods.find((period) => period.state === 'LIVE') ?? null;
  }, [gameDetail.data?.periods]);

  // 이슈 #375 — end-period가 다음 피리어드를 SCHEDULED가 아니라 HALFTIME으로
  // 옮긴다. currentPeriod와 배타적이다(한 번에 최대 하나만 참일 수 있다: 어떤
  // 피리어드도 LIVE가 아니면서 정확히 하나가 HALFTIME이거나, 그 반대다).
  const halftimePeriod = useMemo(() => {
    const periods = gameDetail.data?.periods ?? [];
    return periods.find((period) => period.state === 'HALFTIME') ?? null;
  }, [gameDetail.data?.periods]);

  const hasNextPeriod = useMemo(() => {
    if (currentPeriod === null) return false;
    const periods = gameDetail.data?.periods ?? [];
    return periods.some((period) => period.number === currentPeriod.number + 1);
  }, [currentPeriod, gameDetail.data?.periods]);

  // alpha "452′" 사고 대응 — 현재 피리어드의 설정된 길이(분). `periodDurations`는
  // `GameDetail.periods`와 배열 인덱스로 정렬된다(`GamePeriodDuration` 타입
  // 문서 참고) — 값을 못 읽었거나(레거시 config, 아직 이 필드를 안 주는 목
  // 테스트 등) 그 피리어드 항목이 비정상이면 `null`이고, 그때는 확인 게이트를
  // 그냥 건너뛴다(값을 지어내지 않는다).
  const currentPeriodDurationMinutes = useMemo(() => {
    if (currentPeriod === null) return null;
    const durations = gameDetail.data?.periodDurations ?? null;
    const entry = durations?.[currentPeriod.number - 1] ?? null;
    return entry?.durationMinutes ?? null;
  }, [currentPeriod, gameDetail.data?.periodDurations]);

  const availableCommands: readonly GameCommandName[] = useMemo(() => {
    // 이슈 #375 — 하프타임은 gameState==='LIVE'인 채로 지속되는 실제 상태라
    // (요건 3 테스트: "LIVE 중에는 보이지 않는다"의 반례가 되지 않도록)
    // gameState 스위치보다 먼저 갈라야 한다. `pause`는 이 구간에서
    // 뜻이 없어(멈출 LIVE 피리어드가 없다) 뺀다 — 백엔드도 같은 이유로
    // 거부한다(games.service.ts executeCommand의 PERIOD_NOT_STARTED 가드).
    if (gameState === 'LIVE' && halftimePeriod !== null) {
      return ['start-period', 'revert-period', 'end'];
    }
    switch (gameState) {
      case 'SCHEDULED':
        return ['start'];
      case 'LIVE':
        return hasNextPeriod ? ['pause', 'end-period', 'end'] : ['pause', 'end'];
      case 'PAUSED':
        return ['resume', 'end'];
      default:
        return [];
    }
  }, [gameState, hasNextPeriod, halftimePeriod]);

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

  // UX 감사 item 2 — 라인업 없이 경기를 시작하면 복구 불가능한 막다른 길이
  // 된다(시작 후에는 LineupGrid가 "제출된 선발 명단이 없어요"만 보여줄 뿐
  // 되돌릴 수단이 없었다). `latestOperableLineup`은 `LineupGrid`가 빈 상태를
  // 판정하는 것과 정확히 같은 기준(SUBMITTED/LOCKED)이다 — 여기서 다시
  // 구현하면 두 판정이 갈릴 수 있다.
  const sidesMissingLineup = useMemo(() => {
    const sidesList = gameDetail.data?.sides ?? [];
    const lineupsList = fixtureLineup.data?.lineups ?? [];
    return sidesList.filter((side) => latestOperableLineup(lineupsList, side.id) === null);
  }, [gameDetail.data?.sides, fixtureLineup.data?.lineups]);

  // UX 감사 item 6 — 경기장에서 가장 먼저 봐야 할 정보 중 하나인데도 헤더에
  // 점수가 아예 없었다. 확정 이벤트에서 파생하되, `on-pitch-state.ts`가 쓰는
  // 것과 동일한 규칙으로 되돌려진(reversed) 이벤트는 제외한다 — 서버
  // `scoreFromEvents`(games.service.ts)와 같은 정의다(어시스트 사후 기록이
  // GOAL을 되돌렸다 재기록하는 동안 잠깐 스코어가 흔들리지 않아야 한다는
  // 요건과도 맞는다).
  const scoreBySideId = useMemo(() => {
    const sidesList = gameDetail.data?.sides ?? [];
    // Realtime scoreboard bug (2026-08) hardening: `GameEventRecord.
    // reversesEventId`/`.id` are typed `string | null` — never `undefined`
    // — but that's a compile-time promise, not a runtime guarantee for data
    // that crossed an untyped WS boundary. The actual bug (fixed at its
    // source in `RealtimeGateway.acknowledgeGameEvent`, see that function's
    // comment) was a self-committed event missing BOTH fields: `undefined
    // !== null` let its own `reversesEventId` slip into this set, and
    // `.has(event.id)` then matched it — and every OTHER `id: undefined`
    // event — against itself, silently excluding real goals from the score.
    // Guarding `undefined` here too keeps this exact silent-exclusion
    // failure mode from recurring if a future WS/REST path repeats that
    // mistake — it does not paper over the source bug, which is still fixed
    // upstream.
    const reversedIds = new Set(
      ops.liveEvents
        .map((event) => event.reversesEventId)
        .filter((id): id is string => id !== null && id !== undefined),
    );
    const score = new Map<string, number>(sidesList.map((side) => [side.id, 0]));
    for (const event of ops.liveEvents) {
      // Note: NOT excluding `event.id === undefined` here — a malformed
      // event missing `id` is still a real, valid goal that must count
      // (that's the whole point of this fix). What must never happen is an
      // `undefined` id being treated as "this exact event was reversed" —
      // handled above by keeping `undefined` out of `reversedIds` in the
      // first place, not by disqualifying events that lack an `id`.
      if (event.type !== 'GOAL' || event.sideId === null || event.sideId === undefined || reversedIds.has(event.id)) {
        continue;
      }
      score.set(event.sideId, (score.get(event.sideId) ?? 0) + 1);
    }
    return score;
  }, [gameDetail.data?.sides, ops.liveEvents]);

  const { confirm, ConfirmModal: endGameConfirmModal } = useConfirm();

  // alpha "452′" 사고 대응 — 제출 직전 마지막 확인. `clockMs`가 이 피리어드의
  // 설정된 길이를 크게 넘으면(`isClockSuspicious`) 운영자에게 한 번 더
  // 물어본다. `currentPeriodDurationMinutes`가 `null`이면(설정을 못 읽음)
  // 판단 근거가 없으므로 그냥 통과시킨다 — 지어낸 기준으로 막지 않는다.
  // 이 함수는 제출을 "막지" 않는다: 운영자가 확인하면 그대로 진행되고,
  // 취소하면 호출부가 제출 자체를 하지 않을 뿐이다(서버 하드 거부와 다름).
  const confirmIfClockSuspicious = useCallback(
    async (clockMs: number, periodNumber: number): Promise<boolean> => {
      if (currentPeriodDurationMinutes === null || !isClockSuspicious(clockMs, currentPeriodDurationMinutes)) {
        return true;
      }
      return confirm({
        title: '기록 시각을 확인해주세요',
        message: `${periodLabel(periodNumber)} ${formatMatchClock(clockMs)}로 기록돼요. 이 피리어드는 보통 ${currentPeriodDurationMinutes}분이에요. 경기 종료를 누르지 않은 채 시간이 흘렀을 수 있어요 — 그대로 기록할까요?`,
        confirmLabel: '그대로 기록',
        tone: 'danger',
      });
    },
    [confirm, currentPeriodDurationMinutes],
  );

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
    async (input: EventCaptureCommitInput) => {
      if (!(await confirmIfClockSuspicious(input.clockMs, input.period))) return;
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
    [ops, showToast, confirmIfClockSuspicious],
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
    async (input: { sideId: string; outParticipant: GameLineupParticipant; inParticipant: GameLineupParticipant }) => {
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
      // 빠른 교체는 원래 확인창 없이 한 탭으로 끝나는 게 설계 의도지만(위 문서
      // 참고), 시각이 비정상일 때만은 예외다 — `handleRunCommand`의 '경기
      // 종료'가 이미 같은 패턴(평소엔 즉시 실행, 위험할 때만 확인)이다.
      if (!(await confirmIfClockSuspicious(frozen.clockMs, frozen.period))) return;
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
    [currentPeriod, ops, showToast, confirmIfClockSuspicious],
  );

  const handleRunCommand = useCallback(
    async (command: GameCommandName) => {
      if (!gameId || !isTakeoverHeld(ops.takeover)) return;
      // UX 감사 item 3 — "경기 종료"는 되돌릴 수 없는데 확인 단계 없이 즉시
      // 실행됐다. 이슈 #375 정정: 예전 이 주석은 "다른 명령(...전반종료)은
      // 되돌릴 수 있으니 확인 없이 즉시 실행한다"고 적혀 있었지만, 그
      // 시점엔 되돌리기 자체가 아예 없어 전제가 거짓이었다(원인 브리프
      // 참고). 지금은 `end-period`가 진짜로 되돌릴 수 있는 명령이다 —
      // 하프타임 동안은 물론, 다음 피리어드에 이벤트가 하나도 없는 동안은
      // 그 뒤에도 서버가 되돌리기를 허용한다(`revert-period`,
      // GamesService.revertPeriodTransition). `start-period`/`revert-period`도
      // 같은 이유로 확인을 생략한다(각각 스스로 되돌릴 수 있거나, 되돌리기
      // 그 자체다). 진짜로 되돌릴 수 없는 건 `end`(경기 종료) 하나뿐이라
      // 확인 게이트는 여전히 그 하나에만 건다.
      if (command === 'end') {
        const confirmed = await confirm({
          title: '경기를 종료할까요?',
          message: '종료하면 되돌릴 수 없어요. 기록한 골·카드·교체를 먼저 확인해주세요.',
          confirmLabel: '경기 종료',
          tone: 'danger',
        });
        if (!confirmed) return;
      }
      setCommandPending(true);
      setCommandError(null);
      setLastCommandFeedback(null);
      // 라벨은 실행 "전" currentPeriod/halftimePeriod 기준으로 미리 굳혀둔다 —
      // end-period/start-period 명령이 성공하면 refetch 후 currentPeriod·
      // halftimePeriod가 곧장 바뀌어서(하프타임 진입/탈출), 완료 후에 다시
      // 계산하면 "방금 무엇을 끝냈는지"가 아니라 "다음에 뭘 할 수 있는지"로
      // 라벨이 뒤바뀐다.
      const label = commandLabel(command, currentPeriod?.number ?? null, halftimePeriod?.number ?? null);
      const startedAtMs = performance.now();
      try {
        const result = await postV1GameCommand(gameId, command, {
          expectedVersion: gameVersion,
          clientCommandId: randomUuid(),
          takeoverToken: ops.takeover.token,
          occurredAt: new Date(Date.now() + ops.clockOffsetMs).toISOString(),
          payload: {},
        });
        // UX 감사 — 커맨드 성공은 소켓으로 브로드캐스트되지 않는다(REST
        // 전용, D-10). `gameState`는 `ops.gameSnapshot?.state`를
        // `gameDetail.data?.state`보다 우선하므로, 아래 refetch만으로는
        // 화면이 안 바뀐다(alpha 실측: "재개 완료"는 떴는데 계속 "일시
        // 중지"로 보임, 새로고침해야 풀림) — REST 응답을 그 자리에서
        // gameSnapshot에 반영해야 헤더/버튼이 즉시 갱신된다.
        ops.applyCommandResult(result);
        await gameDetail.refetch();
        setLastCommandFeedback({ label, durationMs: Math.round(performance.now() - startedAtMs) });
        // 이슈 #375 — 기존 골/교체 되돌리기(findRecentGoalEvent /
        // ops.reverseEvent)와 같은 토스트 패턴을 따른다: end-period 직후
        // "방금 실수로 눌렀다"를 바로 되돌릴 수 있는 액션을 붙인다. 골/교체
        // 되돌리기와 달리 "어떤 이벤트인지" 찾을 필요가 없다 — 되돌릴
        // 대상은 서버가 "지금 되돌릴 수 있는 전환" 하나로 유일하게 정한다
        // (GamesService.revertPeriodTransition). 하프타임 창을 넘겨 다음
        // 피리어드에 이벤트가 이미 생겼다면 서버가 PERIOD_REVERT_HAS_EVENTS로
        // 거부하고, 그 실패는 이 화면의 공용 오류 배너로 그대로 뜬다(토스트
        // 자체는 별도 실패 처리를 하지 않는다).
        if (command === 'end-period') {
          showToast(`${label}했어요`, {
            action: {
              label: '되돌리기',
              onClick: () => {
                void handleRunCommandRef.current('revert-period');
              },
            },
          });
        }
      } catch (error) {
        setCommandError(extractErrorMessage(error, '명령을 처리하지 못했어요. 다시 시도해주세요.'));
      } finally {
        setCommandPending(false);
      }
    },
    [gameId, ops, gameVersion, gameDetail, currentPeriod, halftimePeriod, confirm, showToast],
  );

  // 이슈 #375 — Copilot review 패턴 재사용(PR #276, 위 liveEventsRef와 같은
  // 이유): 되돌리기 토스트의 onClick이 "토스트를 띄운 그 순간의"
  // handleRunCommand 클로저를 그대로 들고 몇 초를 살아있으면, 그사이
  // gameVersion이 바뀌어도(end-period 성공 자체가 버전을 올린다) 반영되지
  // 않아 되돌리기 요청이 낡은 expectedVersion으로 나가 충돌한다 — ref로
  // 항상 최신 함수를 가리키게 한다.
  const handleRunCommandRef = useRef(handleRunCommand);
  useEffect(() => {
    handleRunCommandRef.current = handleRunCommand;
  }, [handleRunCommand]);

  if (fixtureLineup.isLoading || (gameId && gameDetail.isLoading)) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-[var(--text-muted)]">
        불러오는 중이에요…
      </div>
    );
  }

  if (fixtureLineup.isError) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 px-4 text-center">
        <p className="text-sm font-medium text-[var(--text-body)]">
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
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-[var(--text-muted)]">
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
      <header className="sticky top-0 z-10 -mx-4 border-b border-[var(--border)] bg-white/95 px-4 py-3 backdrop-blur-sm dark:bg-gray-900/95">
        {/* T1-0: next-period(현재는 end-period) 버튼이 추가되며 LIVE 상태의
            버튼이 최대 3개(일시 중지/전반 종료/경기 종료)가 됐다. 기존 "한
            줄에 타이틀+뱃지+버튼" 레이아웃은 390px 모바일에서 버튼 3개가
            shrink-0로 자기 너비를 그대로 차지해 왼쪽 뱃지·연결상태 영역이
            극단적으로 좁아져 "진행 중" 뱃지가 글자 단위로 세로 줄바꿈되는
            회귀를 만들었다(2버튼 상태에서는 재현 안 됨 — 실측 스크린샷으로
            확인). 모바일에서는 타이틀 행과 버튼 행을 세로로 분리하고, 버튼
            행은 필요시 자체적으로 줄바꿈하도록 바꿔 타이틀/뱃지 쪽 공간을
            압박하지 않는다. sm(640px) 이상은 기존 한 줄 레이아웃을 유지한다
            (768/1440에서는 문제없이 확인됨).
            이슈 #375 — 하프타임 버튼 셋(후반 시작/되돌리기/경기 종료)도 같은
            "비-end 2개 + 구분선 + end 1개" 모양이라 이 컨테이너를 그대로
            재사용한다(새 레이아웃을 만들지 않는다) — 위에서 이미 3버튼
            모바일 줄바꿈까지 검증된 자리다. */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-[var(--text-strong)]">
              {sides.map((side) => side.displayNameSnapshot).join(' vs ') || '경기 운영'}
            </p>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-[var(--text-muted)]">
              <span className="rounded-full bg-[var(--blue50)] px-2 py-0.5 font-semibold text-[var(--blue700)]">
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
            {/* UX 감사 item 3 — "경기 종료"는 되돌릴 수 없는데 나머지 명령과
                6px(gap-1.5)로 붙어 있어 오탭 위험이 컸다. 되돌릴 수 있는
                명령들과 별도 그룹으로 묶고 구분선을 둬 시각적·물리적으로
                떼어낸다.
                R-K5 CTA 위계 재설계 — LIVE + 다음 피리어드가 있는 상태에서는
                이 그룹에 "일시 중지"·"전반 종료" 둘 다 들어오는데, 예전엔
                둘 다 variant="primary"(파란 배경)라 동급 CTA 2개가 나란히
                있었다("주요 CTA는 화면당 최대 1개"). 이 그룹의 첫 명령만
                주요(파란 배경)로 두고 — 실사용에서 더 자주 누르는 건
                "일시 중지"다(피리어드 종료는 절반의 경기 시간에 한 번뿐,
                일시 중지는 파울·부상 등으로 언제든 필요) — 나머지는 보조
                (outline)로 후퇴시킨다. */}
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              {availableCommands
                .filter((command) => command !== 'end')
                .map((command, index) => {
                  const Icon = COMMAND_ICON[command];
                  return (
                    <Button
                      key={command}
                      size="sm"
                      variant={index === 0 ? 'primary' : 'outline'}
                      disabled={
                        !isTakeoverHeld(ops.takeover) ||
                        commandPending ||
                        // UX 감사 item 2 — 라인업 없이 시작하면 되돌릴 수단이
                        // 없는 막다른 길이 된다. 버튼을 숨기지 않고 비활성 +
                        // 아래 배너의 사유로 설명한다(감사의 반복 패턴 ①).
                        (command === 'start' && sidesMissingLineup.length > 0)
                      }
                      loading={commandPending}
                      onClick={() => handleRunCommand(command)}
                    >
                      {!commandPending ? <Icon size={14} aria-hidden="true" /> : null}
                      {commandLabel(command, currentPeriod?.number ?? null, halftimePeriod?.number ?? null)}
                    </Button>
                  );
                })}
              {availableCommands.includes('end') ? (
                <>
                  <span aria-hidden="true" className="mx-0.5 h-6 w-px shrink-0 bg-[var(--border)]" />
                  <Button
                    key="end"
                    size="sm"
                    variant="danger"
                    disabled={!isTakeoverHeld(ops.takeover) || commandPending}
                    loading={commandPending}
                    onClick={() => handleRunCommand('end')}
                  >
                    {!commandPending ? <Square size={14} aria-hidden="true" /> : null}
                    {commandLabel('end', currentPeriod?.number ?? null, halftimePeriod?.number ?? null)}
                  </Button>
                </>
              ) : null}
            </div>
            {/* "재개/경기종료할 때 얼마나 걸렸는지" — 실측 사고에서 나온 요구.
                방금 실행한 명령에만 붙는 일회성 피드백이라 다음 명령을 누르는
                순간(`setLastCommandFeedback(null)`) 사라진다. */}
            {lastCommandFeedback ? (
              <p className="text-xs tabular-nums text-[var(--text-muted)]" aria-live="polite">
                {lastCommandFeedback.label} 완료 · {lastCommandFeedback.durationMs}ms
              </p>
            ) : null}
          </div>
        </div>
        {/* UX 감사 item 6 — 경기장에서 가장 먼저 봐야 할 정보 중 하나인데 헤더에
            점수가 아예 없었다. 경과시간과 같은 위계(text-2xl font-bold)로,
            같은 행에 나란히 둔다. sides 배열 순서를 그대로 써서 위 제목
            줄("A vs B")과 좌우 순서가 반드시 일치한다 — 홈/원정을 임의로
            가정하지 않는다. */}
        {sides.length > 0 ? (
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="flex items-baseline gap-1.5">
              <span className="text-xs font-semibold text-[var(--text-muted)]">스코어</span>
              <span
                className="text-2xl font-bold tabular-nums text-[var(--text-strong)]"
                aria-label={`스코어 ${sides.map((side) => `${side.displayNameSnapshot} ${scoreBySideId.get(side.id) ?? 0}점`).join(', ')}`}
              >
                {sides.map((side) => scoreBySideId.get(side.id) ?? 0).join(' : ')}
              </span>
            </p>
            {currentPeriod && currentPeriod.startedAt ? (
              <ElapsedMatchClock
                periodNumber={currentPeriod.number}
                periodStartedAtMs={new Date(currentPeriod.startedAt).getTime()}
                offsetMs={ops.clockOffsetMs}
                pausedTotalMs={currentPeriod.pausedTotalMs}
                pausedAtMs={currentPeriod.pausedAt === null ? null : new Date(currentPeriod.pausedAt).getTime()}
              />
            ) : halftimePeriod !== null ? (
              // 이슈 #375 — 어떤 피리어드도 LIVE가 아니므로 경과 시간 자체가
              // 없다(잴 대상이 없다). 자리를 비워두면(예전 동작) "고장
              // 났나?" 처럼 읽히므로, ElapsedMatchClock과 같은 슬롯에
              // 같은 시각적 무게로 하프타임임을 명시한다 — STATE_LABEL
              // 뱃지는 여전히 "진행 중"이라(게임 자체는 LIVE) 이 칩이 없으면
              // 하프타임이라는 사실이 화면 어디에도 안 보인다. 아이콘은
              // `Pause`(=PAUSED 상태 배지가 이미 쓰는 아이콘) 대신
              // `Timer`를 써서 "일시 중지"와 헷갈리지 않게 한다 — 아래
              // RestTimer("휴식 타이머")와 같은 아이콘 언어를 공유한다.
              <span className="flex items-center gap-1.5 rounded-lg bg-[var(--blue50)] px-2.5 py-1 text-sm font-bold text-[var(--blue700)] dark:bg-blue-500/10">
                <Timer size={16} aria-hidden="true" />
                하프타임
              </span>
            ) : null}
          </div>
        ) : null}
      </header>

      {/* Banners — never silently swallowed; each condition is its own
          visible, dismissable-by-recovery state. */}
      <div className="flex flex-col gap-2 px-4" aria-live="polite">
        {/* UX 감사 item 4 — takeover.status가 'none'/'requesting'인 동안(마운트 시
            자동 요청, 매번 콘솔을 열 때마다 거치는 구간) 명령 버튼과
            LineupGrid가 전부 비활성인데 이유를 알려주는 배너가 없었다(감사의
            반복 패턴 ①). */}
        {(ops.takeover.status === 'none' || ops.takeover.status === 'requesting') && (
          <Banner tone="info">경기 운영 권한을 가져오는 중이에요…</Banner>
        )}
        {/* UX 감사 item 2 — 라인업 없이 시작하면 복구 불가능한 막다른 길이 된다.
            버튼이 비활성인 이유를 여기서 설명하고, 바로 제출하러 갈 수 있는
            링크를 함께 준다. */}
        {gameState === 'SCHEDULED' && sidesMissingLineup.length > 0 && (
          <Banner tone="warning">
            {sidesMissingLineup.map((side) => side.displayNameSnapshot).join(', ')} 팀의 선발 명단을 제출해야
            경기를 시작할 수 있어요.{' '}
            <Link
              href={`/tournaments/${tournamentId}/matches/${fixtureId}/lineup`}
              className="font-semibold underline underline-offset-2"
            >
              라인업 제출하러 가기
            </Link>
          </Banner>
        )}
        {/* 이슈 #375 — halftimePeriod가 있을 때도 currentPeriod는 null이라
            (LIVE인 피리어드가 없다), 이 조건을 손대지 않았다면 하프타임
            도중에도 "경기를 시작해 주세요."가 그대로 떠서 운영자가 경기가
            아직 시작조차 안 됐다고 오해할 뻔했다. 하프타임은 별도의 정확한
            안내로 갈라낸다. */}
        {halftimePeriod !== null && gameState === 'LIVE' && (
          <Banner tone="info">
            하프타임이에요. 준비되면 위 &lsquo;{startPeriodCommandLabel(halftimePeriod.number)}&rsquo;을 눌러주세요.
          </Banner>
        )}
        {currentPeriod === null &&
          halftimePeriod === null &&
          gameState !== 'ENDED' &&
          gameState !== 'CANCELLED' &&
          !(gameState === 'SCHEDULED' && sidesMissingLineup.length > 0) && (
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

      {/* 휴식 타이머(하프타임·부상 중단) — 경기가 SCHEDULED 이전(아직 시작 전)이나
          이미 ENDED/CANCELLED된 뒤에는 의미가 없으므로 LIVE/PAUSED에서만 보여준다.
          "다음 피리어드가 없을 때"로 좁히지 않는 이유: 부상 중단은 어느 피리어드
          중에도 필요하다. */}
      {(gameState === 'LIVE' || gameState === 'PAUSED') && <RestTimer />}

      <TeamFoulCounterBar sides={sides} counts={foulCounts} period={currentPeriod?.number ?? 1} />

      {/* 액션 우선 리오더: 이 자리는 예전엔 탭 가능한 선수 그리드였다(선수 먼저 →
          액션). 지금은 액션이 먼저이므로, 그 다음 조작이 실제로 일어나는 자리가
          정확히 이 위치를 차지해야 한다 — 그래서 선수 그리드가 아니라 액션 버튼이
          이 자리를 채운다(요소를 없앤 게 아니라 같은 자리의 진입점을 바꾼 것).
          "누구"를 고르는 단계는 `ActionTargetPicker` 모달에서 처리한다. */}
      {/* 액션 버튼 그리드 — R-C1/R-C2 재설계: 예전엔 골=초록/옐로=주황/
          레드=빨강 배경으로 버튼 전체를 의미색으로 채웠다("의미색은 상태
          배지 전용, 장식 금지"를 어긴 자리 — 배지가 아니라 액션 버튼인데
          배지처럼 배경 전체를 칠했다). 다섯 버튼 전부 같은 중립(outline)
          배경으로 통일하고, 의미는 아이콘·스와치 색 하나로만 좁혀
          전달한다(R-C3: 색+라벨 텍스트 병행은 그대로 유지). 그 결과 한
          화면에서 "배경이 꽉 찬 유채색 강조"는 0개가 되고, 색은 작은
          지시자로만 남는다 — 나머지(버튼 배경·테두리·라벨)는 후퇴시켜
          강조가 뭉개지지 않게 한다(R-D2).
          위계 재설계(alpha 390px 실측 지적) — 예전엔 "교체"만 마지막 칸이라는
          이유로 전폭(2칸)을 차지해, 실제 사용 빈도·중요도가 가장 낮은 축에
          속하는 교체가 화면에서 가장 큰 버튼이 됐다(다섯 버튼 중 유일하게
          "행동 하나로 끝나지 않는" 액션이라 오히려 실수 유발 여지도 큼). 실제
          현장 빈도는 골이 압도적으로 높고(경기당 여러 번, 즉시 기록 필요),
          카드·파울이 그다음, 교체가 가장 드물다(경기당 정해진 횟수). 전폭
          자리를 마지막 항목이 아니라 **골**에 준다 — 모바일에서는 골이
          단독으로 한 줄 전체(2칸)를 차지하고 살짝 더 높게(h-20) 서서
          "가장 먼저 눈에 띄고 가장 먼저 손이 가는" 위치(엄지 도달 최상단)를
          갖는다. 나머지 네 버튼(옐로/레드/파울/교체)은 그 아래 2×2로 가지런히
          정렬된다 — 카드 2개가 한 행, 파울·교체가 한 행이라 성격이 가까운
          것끼리 묶인다. 색은 여전히 전부 outline 중립(R-K5 "동급 CTA는
          1개"를 지키려 골을 primary/파란색으로 올리지 않는다 — 이미 헤더의
          "일시 중지"가 이 화면의 유일한 파란 CTA다) — 위계는 오직 크기·
          위치로만 만든다.
          sm 이상: 5개가 균등 5열이면 이 위계가 데스크톱에서만 사라진다.
          6열 그리드로 바꿔 골이 2칸(전체의 2/6 ≈ 33%), 나머지가 각 1칸
          (1/6 ≈ 17%)을 차지하게 해 폭 2배 관계를 모바일과 동일하게
          유지하면서, 6개 칸(2+1+1+1+1)이 딱 맞아떨어져 줄바꿈 없이 한 줄에
          정렬된다. */}
      <div className="grid grid-cols-2 gap-2 px-4 sm:grid-cols-6">
        {ACTION_BUTTONS.map((button, index) => (
          <Button
            key={`${button.type}-${button.cardColor ?? index}`}
            size="lg"
            variant="outline"
            className={`flex-col gap-1${
              index === 0 ? ' col-span-2 h-20 sm:col-span-2 sm:h-16' : ' h-16'
            }`}
            disabled={!isTakeoverHeld(ops.takeover) || currentPeriod === null}
            onClick={() => handleSelectAction(button)}
          >
            {button.type === 'GOAL' ? (
              <Goal size={18} aria-hidden="true" className="text-green-600 dark:text-green-400" />
            ) : button.type === 'FOUL' ? (
              <AlertTriangle size={18} aria-hidden="true" className="text-[var(--text-muted)]" />
            ) : button.type === 'SUBSTITUTION' ? (
              <ArrowLeftRight size={18} aria-hidden="true" className="text-[var(--blue700)]" />
            ) : (
              <span
                aria-hidden="true"
                className={`block h-4 w-3 rounded-[2px] ${button.cardColor === 'RED' ? 'bg-red-500' : 'bg-yellow-300'}`}
              />
            )}
            {button.label}
          </Button>
        ))}
      </div>

      {/* 풋살 등 롤링 교체 종목 전용 — 하드코딩된 종목명이 아니라
          `substitutionPolicy.mode`(config 값)로만 노출 여부를 판단한다(요건 B).
          기본 `교체` 액션(액션 우선 2단계)은 이 종목에서도 항상 그대로 쓸 수
          있다 — 이 토글은 그 위에 얹는 선택적 빠른 경로다.
          정렬 재설계(alpha 390px 실측 지적) — 예전엔 `self-start`로 왼쪽에
          작게 붙어 있어, 바로 위 액션 그리드와 좌우 경계가 어긋나고 크기도
          확 줄어 "따로 노는 버튼"처럼 보였다. `block`(전폭)으로 바꿔 위
          그리드와 정확히 같은 `px-4` 좌우 경계를 공유하게 한다 — 그리드가
          끝나는 자리에서 자연스럽게 다음 단(선택적 빠른 경로)으로 이어지는
          느낌을 준다. 높이는 그대로 sm(44px 터치 타깃)을 유지한다 — 이건
          다섯 액션 버튼과 동급 빈도가 아니라 그 아래 얹는 보조 토글이라,
          높이까지 h-16으로 맞추면 오히려 "6번째 액션 버튼"처럼 위계가
          부풀어 보인다. */}
      {gameDetail.data?.substitutionPolicy?.mode === 'rolling' && (
        <div className="flex flex-col gap-2 px-4">
          <Button
            size="sm"
            variant={quickSubstitutionMode ? 'primary' : 'outline'}
            block
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
        <h3 className="mb-2 text-sm font-semibold text-[var(--text-strong)]">기록된 이벤트</h3>
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
          <h3 className="mb-2 text-sm font-semibold text-[var(--text-strong)]">전송 상태</h3>
          <QueueStatusPanel items={ops.queue.items} onRetry={ops.retryFailedEvent} />
        </section>
      )}

      {pendingAction && (
        <ActionTargetPicker
          open
          tournamentId={tournamentId}
          fixtureId={fixtureId}
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
      {endGameConfirmModal}
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
    info: 'bg-[var(--blue50)] text-[var(--blue700)]',
    warning: 'bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300',
    danger: 'bg-[var(--red50)] text-[var(--red700)]',
  }[tone];
  return (
    <p role={tone === 'danger' ? 'alert' : 'status'} className={`rounded-lg px-3 py-2 text-sm font-medium ${toneClass}`}>
      {children}
    </p>
  );
}
