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
  Target,
  Timer,
} from 'lucide-react';
import { Button } from '@/components/v1-ui/button';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { useV1AuthMe, useV1GameResultRevisions } from '@/hooks/use-v1-api';
import {
  useV1FixtureLineup,
  useV1Game,
  useV1SetParticipantArrival,
  postV1GameCommand,
} from '@/hooks/use-v1-game-operations';
import { readGameResultScore } from '@/lib/game-result-score';
import { gameOperationsErrorMessage, useV1GameOperationsConsole } from '@/hooks/use-v1-game-operations-console';
import { isTakeoverHeld } from '@/lib/game-operations-queue';
import {
  freezeCapture,
  isClockSuspicious,
  type FrozenEventCapture,
} from '@/lib/game-operations-clock';
import { extractErrorMessage } from '@/lib/error-message';
import { randomUuid } from '@/lib/uuid';
import { ActionTargetPicker, type EventCaptureCommitInput } from './action-target-picker';
import { latestOperableLineup } from './lineup-grid';
import { ElapsedMatchClock } from './elapsed-match-clock';
import { QueueStatusPanel, hasUnsettledQueueItems } from './queue-status-panel';
import { RecordedEventList } from './recorded-event-list';
import { AssistPickerSheet } from './assist-picker-sheet';
import { QuickSubstitutionPanel } from './quick-substitution-panel';
import { AbnormalEndDialog, type AbnormalEndReason } from './abnormal-end-dialog';
import { ArrivalCheckinPanel } from './arrival-checkin-panel';
import { RestTimer } from './rest-timer';
import { PenaltyShootoutPanel } from './penalty-shootout-panel';
import { useEventToast, EventToasts } from '@/components/game-operations/event-toast';
import { findRecentGoalEvent } from '@/lib/find-recent-goal-event';
import { findRecentSubstitutionEvent } from '@/lib/find-recent-substitution-event';
import { deriveFoulCounts } from '@/lib/team-foul-counter';
import { deriveOnPitchParticipantIds, countActiveSubstitutions } from '@/lib/on-pitch-state';
import { TeamFoulCounterBar } from '@/components/game-operations/team-foul-counter-bar';
import { formatMatchClock } from '@/lib/game-operations-clock';
import { periodLabel } from './period-label';
import {
  commandConfirmCopy,
  commitActionConfirmCopy,
  penaltyShootoutFinishConfirmCopy,
  penaltyShootoutOverrideFinishConfirmCopy,
  penaltyShootoutStartConfirmCopy,
  playerLabel,
} from './confirm-copy';
import {
  penaltyScoreBySideId,
  penaltyFinishAvailability,
  type PenaltyKick,
  type PenaltyKickResult,
} from '@/lib/penalty-shootout';
import type {
  GameCardColor,
  GameCommandName,
  GameEventRecord,
  GameEventType,
  GameLineup,
  GameLineupParticipant,
  GameSide,
  GameSideKey,
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
  /** 선수 없이 팀 단위로 기록할 수 있는 이벤트인지 나타낸다. 득점 이벤트는
   * 명시적인 익명 payload로 저장되어 누락 경고와 구분된다. */
  readonly allowTeamOnly: boolean;
  readonly frozen: FrozenEventCapture;
}

const ACTION_BUTTONS: ReadonlyArray<{
  readonly type: GameEventType;
  readonly label: string;
  readonly cardColor?: GameCardColor;
  readonly allowTeamOnly: boolean;
}> = [
  { type: 'GOAL', label: '골', allowTeamOnly: true },
  { type: 'OWN_GOAL', label: '자책골', allowTeamOnly: true },
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
  const setArrival = useV1SetParticipantArrival(fixtureLineup.data?.gameId ?? null, {
    tournamentId,
    fixtureId,
  });
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
  // 몰수·중단 종료 다이얼로그. 사유 자유 텍스트를 받아야 해서 useConfirm(boolean)으로는 안 된다.
  const [abnormalEndOpen, setAbnormalEndOpen] = useState(false);
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
  // 확인 모달이 떠 있는 동안 버전이 낡는 문제(409 VERSION_CONFLICT) —
  // 커맨드는 이제 예외 없이 확인을 거치고(사용자 결정), 승부차기 입력은 킥을
  // 다 찍을 때까지 수 분이 걸릴 수도 있다. 그사이 다른 이벤트가 커밋되면
  // (`use-v1-game-operations-console`의 WS ack가 gameSnapshot.version을
  // 올린다) 모달을 연 렌더의 클로저가 들고 있던 `gameVersion`은 이미 낡은
  // 값이고, 그대로 보내면 서버가 CAS에서 409를 던진다(postV1GameCommand는
  // 재시도하지 않는다). ref로 "보내는 순간의" 최신 버전을 읽는다 —
  // 아래 handleRunCommandRef가 토스트 콜백에 쓰는 것과 같은 패턴이다.
  const gameVersionRef = useRef(gameVersion);
  useEffect(() => {
    gameVersionRef.current = gameVersion;
  }, [gameVersion]);

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

  // 종료 흐름 개편(사용자 결정 2) — "후반은 끝났지만 결과는 아직 확정 전"인
  // 중간 단계. 새 상태 컬럼도 새 enum 값도 없다: 마지막 피리어드를
  // `end-period`로 닫으면(다음 피리어드가 없으므로 HALFTIME 승격이 생략된다)
  // **게임은 LIVE인데 LIVE도 HALFTIME도 아닌 피리어드만 남는** 조합이 되고,
  // 그 조합 자체가 곧 "정규 시간 종료"다(백엔드 `endCurrentPeriod` doc 참고).
  // `gameState !== 'LIVE'`를 먼저 배제해야 한다 — 경기가 ENDED된 뒤에도
  // 모든 피리어드는 ENDED이므로 그 상태까지 이 값이 참이 되면 종료된 경기에
  // "경기 종료" 버튼이 다시 살아난다.
  const regulationEnded = useMemo(() => {
    if (gameState !== 'LIVE') return false;
    const periods = gameDetail.data?.periods ?? [];
    if (periods.length === 0) return false;
    return periods.every((period) => period.state === 'ENDED');
  }, [gameState, gameDetail.data?.periods]);

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
    // 종료 흐름 개편(사용자 결정 2) — 정규 시간이 끝난 중간 단계에서는
    // 남은 동작이 "경기 종료"(또는 결선 무승부면 그 자리를 대신하는
    // 승부차기 입력)뿐이다. 되돌릴 피리어드 전환이 없으므로
    // `revert-period`도 넣지 않는다(백엔드가 PERIOD_REVERT_NOT_AVAILABLE로
    // 거부한다 — 누를 수 없는 버튼을 만들지 않는다).
    if (gameState === 'LIVE' && regulationEnded) {
      return ['end'];
    }
    switch (gameState) {
      case 'SCHEDULED':
        return ['start'];
      case 'LIVE':
        // 마지막 피리어드에서도 이제 `end-period`(=“후반 종료”)를 낸다.
        // 예전엔 여기서 곧장 `end`만 줬고, 그 한 번의 클릭이 피리어드
        // 닫기·게임 ENDED·스코어 산출·결과 리비전 제출·outbox 발행을 전부
        // 했다 — 승부차기를 입력할 자리가 아예 없었다.
        return hasNextPeriod ? ['pause', 'end-period', 'end'] : ['pause', 'end-period'];
      case 'PAUSED':
        // 일시 중지 중의 `end`는 정상 종료 흐름이 아니라 "경기를 더 진행할
        // 수 없어 중단한다"는 예외 경로다(부상·기상 등). 정상 흐름을 3단계로
        // 쪼갠 뒤에도 이 탈출구는 남긴다 — 다만 결선 무승부라면 아래
        // `endBlockedReason`이 막고 사유를 알려준다(그대로 종료하면 브래킷
        // 진출자를 정할 수 없다).
        return ['resume', 'end'];
      default:
        return [];
    }
  }, [gameState, hasNextPeriod, halftimePeriod, regulationEnded]);

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
      if (
        (event.type !== 'GOAL' && event.type !== 'OWN_GOAL') ||
        event.sideId === null ||
        event.sideId === undefined ||
        reversedIds.has(event.id)
      ) {
        continue;
      }
      score.set(event.sideId, (score.get(event.sideId) ?? 0) + 1);
    }
    return score;
  }, [gameDetail.data?.sides, ops.liveEvents]);

  /* 종료된 경기의 확정 결과 — 승부차기는 골 이벤트가 아니라 `end` 커맨드의
   * `payload.penalties`로 결과 리비전에 저장된다. 그래서 위 `scoreBySideId`(이벤트
   * 파생)로는 절대 복원되지 않는다: 승부차기를 입력하고 종료하면 패널이 닫히면서
   * 방금 기록한 값이 이 화면에서 완전히 사라졌다(알파 실측 — 서버에는 남아 있었다).
   *
   * 경기가 끝난 뒤에만 조회한다(그 전에는 결과 리비전 자체가 없다). 조회 권한은
   * 이 콘솔을 여는 것과 같은 `read` 권한이라 필드 담당자도 그대로 통과한다. */
  const gameEnded = gameState === 'ENDED';
  const resultRevisions = useV1GameResultRevisions(gameId, { enabled: gameEnded });

  const confirmedPenalties = useMemo(() => {
    if (!gameEnded) return null;
    const revisions = resultRevisions.data ?? [];
    if (revisions.length === 0) return null;
    // 확정본이 있으면 그걸 따른다 — 정정으로 점수가 바뀐 경기에서 "가장 최신 리비전"은
    // 아직 확정 전 초안일 수 있고, 그 초안을 결과로 보여주면 화면이 공식 결과와
    // 어긋난다. 확정 전(운영 콘솔로 막 종료한 직후)에는 확정본이 아직 없으므로
    // 최신 리비전(서버 정렬: revision 내림차순)을 쓴다.
    //
    // 확정본 id 를 목록에서 못 찾으면 아무것도 보여주지 않는다(최신으로 폴백하지
    // 않는다). `GET /games/:id/result-revisions` 는 그 경기의 리비전을 페이지네이션
    // 없이 전부 돌려주고 `currentOfficialRevisionId` 는 같은 경기의 리비전만 가리키므로
    // 정상 경로에서는 못 찾을 수 없다 — 못 찾았다는 건 데이터가 어긋났다는 뜻이고,
    // 그 상태에서 초안일 수도 있는 다른 리비전의 승부차기 점수를 "결과"로 그리면
    // 화면이 공식 결과와 다른 값을 단언하게 된다. 결과 표시에서 그건 빈 칸보다 나쁘다.
    const officialId = gameDetail.data?.currentOfficialRevisionId ?? null;
    const chosen = officialId ? revisions.find((revision) => revision.id === officialId) : revisions[0];
    return readGameResultScore(chosen?.score)?.penalties ?? null;
  }, [gameEnded, resultRevisions.data, gameDetail.data?.currentOfficialRevisionId]);

  /**
   * F66 fix: 결과가 실제로 OFFICIAL(확정)까지 갔는지 — 게임이 끝났다고 곧바로
   * 확정된 건 아니다(검토·승인 단계가 남아 있을 수 있다). 위 `confirmedPenalties`와
   * 같은 재료(currentOfficialRevisionId + 그 리비전의 실제 state)를 쓴다. `RecordedEventList`가
   * 이 값을 받아 되돌리기 버튼을 감춘다 — 서버(games.service.ts reverseEvent)도 확정 후엔
   * 409 RESULT_ALREADY_OFFICIAL로 거부하므로, 눌러 보고서야 아는 대신 미리 감춘다.
   */
  const resultOfficialized = useMemo(() => {
    if (!gameEnded) return false;
    const officialId = gameDetail.data?.currentOfficialRevisionId ?? null;
    if (officialId === null) return false;
    const revisions = resultRevisions.data ?? [];
    return revisions.some((revision) => revision.id === officialId && revision.state === 'OFFICIAL');
  }, [gameEnded, gameDetail.data?.currentOfficialRevisionId, resultRevisions.data]);

  /* 확정된 승부차기의 선축 사이드. 저장값은 `sideKey`(`'HOME'|'AWAY'`)이므로 여기서
     사이드 목록과 맞춰 실제 팀으로 되돌린다. 선축이 없던 시절에 저장된 경기(그리고 중첩
     백필 형태)는 `null` — 모르는 것을 지어내지 않고 표시 자체를 생략한다. */
  const confirmedFirstKicker = useMemo(() => {
    const sideKey = confirmedPenalties?.firstKickSideKey;
    if (sideKey === undefined) return null;
    return (gameDetail.data?.sides ?? []).find((side) => side.sideKey === sideKey) ?? null;
  }, [confirmedPenalties, gameDetail.data?.sides]);

  // 과제 2 — 승부차기 시작 버튼 노출 조건. 종료 흐름 개편(사용자 결정 2·3)
  // 으로 이 시점이 **후반 종료 이후**로 옮겨졌다: 예전엔 "마지막 피리어드가
  // 아직 LIVE인 동안"(`currentPeriod !== null && !hasNextPeriod`)에 띄웠는데,
  // 그러면 아직 뛰고 있는 경기 중에 승부차기 입력이 열려 있는 셈이었다.
  // 지금은 `regulationEnded`(모든 피리어드 ENDED + 게임은 여전히 LIVE) —
  // 즉 정규 시간이 실제로 끝난 뒤에만 열린다. 이 시스템은 별도의 "연장전"
  // 피리어드 타입을 두지 않는다(competition-config 프리셋은 전반/후반 두
  // 피리어드뿐 — `연장`은 대회가 설정한 마지막 피리어드가 곧 그 뜻이다).
  //
  // knockout 게이트(`isKnockoutFixture`)가 필요한 이유 — `GamesService.
  // applyPenalties`(백엔드, 이미 배포됨: `.changeset/v1-tournament-result-ops.md`
  // "승부차기" 항목)는 조별리그 픽스처의 `end payload.penalties`를
  // `TOURNAMENT_PENALTY_NOT_ALLOWED`로 거부한다. 이 게이트 없이 "동점이면
  // 무조건 버튼 노출"로 두면, 조별리그 무승부(드물지 않다 — `V1TournamentStanding.
  // draws`가 정식으로 집계되는 결과다)에서마다 "승부차기 시작" → 킥 입력까지
  // 다 하고 "승부차기 종료"에서만 실패하는 깨진 UX가 된다. `isKnockoutFixture`
  // 는 그 판정을 프런트에도 그대로 노출한 것뿐이다(새 판정 로직 아님 —
  // `GET /games/:gameId`의 `GameDetail.isKnockoutFixture` doc 참고).
  const knockoutTied = useMemo(() => {
    if (gameDetail.data?.sourceType !== 'TOURNAMENT_FIXTURE') return false;
    if (gameDetail.data?.isKnockoutFixture !== true) return false;
    const sidesList = gameDetail.data?.sides ?? [];
    if (sidesList.length !== 2) return false;
    return (scoreBySideId.get(sidesList[0].id) ?? 0) === (scoreBySideId.get(sidesList[1].id) ?? 0);
  }, [gameDetail.data?.sourceType, gameDetail.data?.isKnockoutFixture, gameDetail.data?.sides, scoreBySideId]);

  const penaltyShootoutEligible = knockoutTied && regulationEnded;

  // 요구사항 4 — 결선 무승부인데 승부차기가 비어 있으면 경기 종료를 막는다.
  // 예전엔 그대로 보냈고, 서버도 받아 리비전을 SUBMITTED로 저장한 뒤
  // 브래킷 프로젝션이 `BRACKET_RESULT_DRAW_UNSUPPORTED`로 6회 재시도하다
  // outbox 잡이 조용히 POISONED가 됐다(운영자에게는 "종료 성공"으로 보인다).
  // 백엔드도 같은 조건을 409 `TOURNAMENT_PENALTY_REQUIRED`로 막지만
  // (`GamesService.applyPenalties`), 여기서 먼저 눌리지 않게 해 왕복 자체를
  // 없앤다. `penaltyShootoutEligible`인 상태에서는 애초에 "경기 종료" 대신
  // "승부차기 시작"이 렌더되므로 막을 것이 없다 — 남는 건 하프타임·일시
  // 중지처럼 아직 정규 시간이 안 끝난 예외 종료 경로다.
  const endBlockedReason: string | null =
    knockoutTied && !penaltyShootoutEligible
      ? '결선 경기는 무승부로 끝낼 수 없어요. 남은 피리어드를 마친 뒤 승부차기 결과를 입력해주세요.'
      : null;

  // 킥별 기록은 서버에 남지 않는다(옵션 B — `@/lib/penalty-shootout.ts` doc
  // 참고). `null` = 패널이 닫혀 있음, 빈 배열 `[]` = 패널이 열려 있고 아직
  // 킥이 없음 — 이 하나의 상태로 "열림 여부"와 "킥 목록"을 함께 표현해 별도
  // boolean을 두지 않는다.
  const [penaltyKicks, setPenaltyKicks] = useState<PenaltyKick[] | null>(null);
  // 선축(동전 던지기 결과). 킥 목록과 달리 이 값은 **서버에 남는다** —
  // `end` 커맨드의 `payload.penalties.firstKickSideKey`로 실려 리비전에 저장된다.
  // 패널이 닫혀 있는 동안에는 의미가 없으므로 패널을 열 때마다 초기화한다.
  const [firstKickSideId, setFirstKickSideId] = useState<string | null>(null);
  // 이 대회의 종료 판정 정책. 서버가 pinned config에서 해석해 내려준다. 응답에 없으면
  // (구버전 배포·캐시된 쿼리) FIFA 정규로 읽는다 — 이전 동작보다 엄격한 쪽이라 안전한
  // 폴백이다(`GameDetail.penaltyShootoutPolicy` doc 참고).
  // useMemo인 이유: 매 렌더 새 객체를 만들면 이 값을 dep으로 쓰는 콜백
  // (`handleFinishPenaltyShootout`)이 매번 새로 만들어진다.
  const penaltyEarlyStop = gameDetail.data?.penaltyShootoutPolicy?.earlyStop ?? true;
  const penaltyPolicy = useMemo(() => ({ earlyStop: penaltyEarlyStop }), [penaltyEarlyStop]);

  const { confirm, ConfirmModal: confirmModal } = useConfirm();

  // alpha "452′" 사고 대응 — 예전엔 이 계산이 곧장 `confirm()`을 띄우는
  // `confirmIfClockSuspicious`였다(시계가 수상할 때만 확인). 과제 1(사용자
  // 결정: "예외 없이 전부"에 확인 모달)로 이제 모든 커밋이 항상 확인을
  // 거치므로, 시계가 수상하다고 여기서 또 `confirm()`을 부르면 확인 모달이
  // 두 번(먼저 이 경고, 그다음 액션 확인) 뜬다 — 나쁜 UX다. 그래서 이 함수는
  // 더 이상 confirm을 부르지 않고 "경고가 필요한가/피리어드가 몇 분짜리인가"
  // 만 계산해서 돌려주고, 호출부(`handleCommit`/`handleQuickSubstitute`)가
  // `commitActionConfirmCopy`에 이 값을 건네 **같은 모달 안에** 병합한다.
  // `currentPeriodDurationMinutes`가 `null`이면(설정을 못 읽음) 판단 근거가
  // 없으므로 경고 없이 통과시킨다 — 지어낸 기준으로 막지 않는다.
  const clockWarningMinutes = useCallback(
    (clockMs: number): number | null => {
      if (currentPeriodDurationMinutes === null || !isClockSuspicious(clockMs, currentPeriodDurationMinutes)) {
        return null;
      }
      return currentPeriodDurationMinutes;
    },
    [currentPeriodDurationMinutes],
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
      // 확인 모달을 띄우기 전에 선택 화면부터 닫는다 — 모달 두 개가 겹쳐
      // 보이지 않게(ActionTargetPicker의 role="dialog" 위에 ConfirmModal의
      // role="dialog"가 또 뜨는 상태를 만들지 않는다). 확인 문구 자체에
      // 팀·선수·시각이 다 들어 있으니(요구사항 2) 선택 화면을 먼저 닫아도
      // 정보가 사라지지 않는다.
      setPendingAction(null);
      const copy = commitActionConfirmCopy(
        input,
        gameDetail.data?.sides ?? [],
        fixtureLineup.data?.lineups ?? [],
        clockWarningMinutes(input.clockMs),
      );
      if (!(await confirm(copy))) return;
      void ops.submitEvent(input);
      // 익명 GOAL에는 participantId가 없어 findRecentGoalEvent가 매칭할 수 없으므로
      // 어시스트 추가 액션을 달지 않는다(고아 토스트 액션을 만들지 않기 위한 가드).
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
    [ops, showToast, confirm, gameDetail.data?.sides, fixtureLineup.data?.lineups, clockWarningMinutes],
  );

  // 이슈 #376 — 예전엔 ops.reverseEvent(되돌리기) + ops.submitEvent(재제출) 두 번
  // 왕복했다: 같은 렌더의 ops 클로저를 공유하다 보니 submitEvent가 reverseEvent의
  // 버전 갱신을 반영하지 못한 stale expectedVersion을 큐에 넣어 구조적으로
  // VERSION_CONFLICT가 나거나(운이 나쁠 때가 아니라 매번), 목록엔 원본·CORRECTION·
  // 신규 GOAL 세 행이 남았다. ops.assignAssist 한 번 호출로 원본 GOAL의
  // assistParticipantId만 in-place로 채우므로 그 레이스 자체가 사라진다.
  const attachAssist = useCallback(
    async (event: GameEventRecord, assistParticipantId: string) => {
      await ops.assignAssist({ eventId: event.id, assistParticipantId });
    },
    [ops],
  );

  const handleReverseEvent = useCallback(
    async (event: GameEventRecord) => {
      const label =
        event.type === 'GOAL'
          ? '골'
          : event.type === 'OWN_GOAL'
            ? '자책골'
            : event.type === 'CARD'
              ? '카드'
              : event.type === 'FOUL'
                ? '파울'
                : '교체';
      const ok = await confirm({
        title: `${label} 기록을 취소할까요?`,
        message:
          event.type === 'SUBSTITUTION'
            ? '취소 기록이 감사 로그에 남아요.'
            : '취소 기록이 감사 로그에 남아요. 취소 후 올바른 기록을 다시 입력해 주세요.',
        confirmLabel: '기록 취소',
        tone: 'danger',
      });
      if (!ok) return;
      await ops.reverseEvent({ eventId: event.id, reason: `${label} 기록 수정·취소` });
    },
    [confirm, ops],
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
      // 사용자 결정("예외 없이 전부")으로 빠른 교체도 이제 확인을 거친다 —
      // 예전엔 "지정 후 탭" 두 단계 자체가 오조작 방지라 확인창을 생략했지만,
      // 그 설계는 이번 결정으로 폐기됐다(과제 1 doc, `confirm-copy.ts` 참고).
      // `commitActionConfirmCopy`가 일반 교체(ActionTargetPicker 경로)와 정확히
      // 같은 문구 형식을 쓰도록, 제출할 이벤트와 동일한 shape을 먼저 만든다.
      const commitInput: EventCaptureCommitInput = {
        type: 'SUBSTITUTION',
        participantId: input.inParticipant.id,
        sideId: input.sideId,
        period: frozen.period,
        clockMs: frozen.clockMs,
        occurredAt: frozen.occurredAt,
        payload: { outParticipantId: input.outParticipant.id },
      };
      const copy = commitActionConfirmCopy(
        commitInput,
        gameDetail.data?.sides ?? [],
        fixtureLineup.data?.lineups ?? [],
        clockWarningMinutes(frozen.clockMs),
      );
      if (!(await confirm(copy))) return;
      void ops.submitEvent(commitInput);
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
    [currentPeriod, ops, showToast, confirm, gameDetail.data?.sides, fixtureLineup.data?.lineups, clockWarningMinutes],
  );

  // 확인 모달은 더 이상 이 함수 안에서 뜨지 않는다 — 과제 1(사용자 결정:
  // "예외 없이 전부"에 확인)로 start/pause/resume/end-period/start-period/end
  // 전부가 확인을 거쳐야 하는데, 그 문구는 명령마다 달라야 한다(요구사항 2:
  // "정말?" 금지, 팀/스코어가 보여야 함). 그래서 확인은 호출부(아래
  // `confirmAndRunCommand`, 그리고 승부차기 종료의 `handleFinishPenaltyShootout`)
  // 가 각자의 문구로 미리 처리하고, 이 함수는 "이미 확인된 명령을 그대로
  // 실행"만 한다 — `revert-period`(사용자 결정에서 제외된 유일한 명령, 그
  // 자체가 교정 행동이라 확인이 없다)도 같은 이유로 이 함수를 직접 부른다.
  // `payload`는 승부차기 종료가 `{ penalties: { home, away } }`를 실어 보내는
  // 통로다 — 새 커맨드나 새 엔드포인트가 아니라 `end`가 이미 갖고 있던 범용
  // payload 슬롯을 그대로 쓴다(`GamesService.extractEndPenalties` doc 참고).
  // F65 fix: 반환값(성공 true / 실패 false)을 추가했다 — 예전엔 항상 undefined라
  // 호출부가 성공 여부를 알 방법이 없었다. 승부차기 종료(`handleFinishPenaltyShootout`)가
  // 이 값으로 "서버가 실제로 받아들였을 때만" 로컬 킥 입력을 지운다. 기존 호출부
  // (revert-period 토스트, confirmAndRunCommand, 몰수 종료)는 반환값을 그냥 무시하므로
  // 동작이 그대로다.
  const handleRunCommand = useCallback(
    async (command: GameCommandName, payload: Record<string, unknown> = {}): Promise<boolean> => {
      if (!gameId || !isTakeoverHeld(ops.takeover)) return false;
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
          expectedVersion: gameVersionRef.current,
          clientCommandId: randomUuid(),
          takeoverToken: ops.takeover.token,
          occurredAt: new Date(Date.now() + ops.clockOffsetMs).toISOString(),
          payload,
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
        // 자체는 별도 실패 처리를 하지 않는다). 요구사항 6 — 이 되돌리기
        // 토스트는 확인 모달이 생겼다고 없애지 않는다(사후 복구 수단 유지).
        //
        // 종료 흐름 개편 — `hasNextPeriod` 조건이 새로 붙었다. 마지막
        // 피리어드를 닫는 `end-period`(=후반 종료)는 되돌릴 수 없다:
        // `revertPeriodTransition`은 "다음 피리어드를 SCHEDULED로 되감고
        // 이전 피리어드를 다시 LIVE로"가 전부라 되감을 다음 피리어드가
        // 없으면 PERIOD_REVERT_NOT_AVAILABLE 409다. 그런데도 토스트를
        // 붙이면 누를 때마다 실패 배너만 뜨는 거짓 복구 수단이 된다 —
        // 대신 확인 문구가 "되돌릴 수 없다"를 미리 알린다(confirm-copy.ts).
        if (command === 'end-period' && hasNextPeriod) {
          showToast(`${label}했어요`, {
            action: {
              label: '되돌리기',
              onClick: () => {
                void handleRunCommandRef.current('revert-period');
              },
            },
          });
        }
        return true;
      } catch (error) {
        setCommandError(extractErrorMessage(error, '명령을 처리하지 못했어요. 다시 시도해주세요.'));
        return false;
      } finally {
        setCommandPending(false);
      }
    },
    [gameId, ops, gameDetail, currentPeriod, halftimePeriod, hasNextPeriod, showToast],
  );

  // start/pause/resume/end-period/start-period/end 버튼이 실제로 부르는 진입점 —
  // 명령별 확인 문구(`commandConfirmCopy`)를 먼저 보여주고, 확인해야만
  // `handleRunCommand`를 부른다. `revert-period`는 이 함수의 타입에서부터
  // 제외돼 있다(사용자 결정에서 빠진 유일한 명령 — 버튼 onClick이 그 경우엔
  // 이 함수 대신 `handleRunCommand`를 직접 부른다).
  const confirmAndRunCommand = useCallback(
    async (command: Exclude<GameCommandName, 'revert-period'>) => {
      const label = commandLabel(command, currentPeriod?.number ?? null, halftimePeriod?.number ?? null);
      const copy = commandConfirmCopy(command, label, {
        sides: gameDetail.data?.sides ?? [],
        scoreBySideId,
        // 같은 `end-period` 커맨드라도 "전반 종료"(하프타임으로 넘어감,
        // 되돌릴 수 있음)와 "후반 종료"(정규 시간이 끝남, 되돌릴 수 없음)는
        // 사용자에게 전혀 다른 일이다 — 문구가 그 차이를 정확히 말해야 한다.
        isFinalPeriod: !hasNextPeriod,
      });
      if (!(await confirm(copy))) return;
      await handleRunCommand(command);
    },
    [confirm, currentPeriod, halftimePeriod, hasNextPeriod, gameDetail.data?.sides, scoreBySideId, handleRunCommand],
  );

  // 과제 2 — 승부차기 시작. 아직 서버에 아무것도 보내지 않는다(패널을 여는
  // 로컬 상태 전환뿐) — 그래도 사용자 결정("예외 없이 전부")에 따라 확인을
  // 거친다.
  const handleStartPenaltyShootout = useCallback(async () => {
    const copy = penaltyShootoutStartConfirmCopy(gameDetail.data?.sides ?? [], scoreBySideId);
    if (!(await confirm(copy))) return;
    setPenaltyKicks([]);
    // 선축은 매번 다시 고른다 — 직전 승부차기(취소했던 것)의 선택이 남아 있으면
    // 운영자가 동전을 던지지도 않고 그대로 진행하게 된다.
    setFirstKickSideId(null);
  }, [confirm, gameDetail.data?.sides, scoreBySideId]);

  // 패널을 닫는다 — 취소는 사이드 이펙트가 없으므로(아직 아무것도 서버에
  // 보내지 않았다) 확인을 거치지 않는다. ActionTargetPicker의 onCancel과
  // 같은 원칙이다.
  const handleCancelPenaltyShootout = useCallback(() => {
    setPenaltyKicks(null);
  }, []);

  const handleRecordPenaltyKick = useCallback((sideId: string, result: PenaltyKickResult) => {
    setPenaltyKicks((current) => (current === null ? current : [...current, { sideId, result }]));
  }, []);

  // 요구사항 3(과제 2) — 오조작 복구. 로컬 상태 되감기일 뿐이라 확인이 없다
  // (revert-period와 같은 이유 — 되돌리기 자체가 이미 교정 행동이다).
  const handleUndoPenaltyKick = useCallback(() => {
    setPenaltyKicks((current) => (current === null || current.length === 0 ? current : current.slice(0, -1)));
  }, []);

  // 승부차기 종료 — 이 순간에야 `end` 커맨드가 실제로 나간다. `home`/`away`는
  // 배열 순서가 아니라 `sideKey`로 매핑한다(백엔드 `scoreFromEvents`/
  // `GameScore`가 sideKey 기준이지 sides 배열 순서 기준이 아니다 — 순서로
  // 매핑하면 HOME/AWAY가 뒤바뀐 채로 기록될 수 있다).
  const handleFinishPenaltyShootout = useCallback(async (options: { readonly override: boolean }) => {
    if (penaltyKicks === null) return;
    const sidesList = gameDetail.data?.sides ?? [];
    const homeSide = sidesList.find((side) => side.sideKey === 'HOME');
    const awaySide = sidesList.find((side) => side.sideKey === 'AWAY');
    if (homeSide === undefined || awaySide === undefined) return;
    const score = penaltyScoreBySideId(penaltyKicks);
    const homeScore = score.get(homeSide.id) ?? 0;
    const awayScore = score.get(awaySide.id) ?? 0;
    // 패널의 "승부차기 종료" 버튼과 **같은 술어**를 여기서도 한 번 더 본다 — 버튼
    // 비활성만으로는 막을 수 없는 경로(포커스된 채 Enter, 확인 모달 대기 중 상태 변화)가
    // 남기 때문이다. 이 판정은 서버가 할 수 없다(총점 두 개만 저장한다).
    const availability = penaltyFinishAvailability(penaltyKicks, sidesList, firstKickSideId, penaltyPolicy);
    // `BLOCKED`는 어느 버튼으로 왔든 거부한다 — 보낼 값이 없거나(사이드·선축 미정) 서버가
    // 되돌릴 값(동점)이라, 우회 종료라도 통과시키면 실패하는 요청만 늘어난다.
    if (availability === 'BLOCKED') return;
    // 자동 종료 버튼으로 온 요청은 규칙상 결판난 상태에서만 통과시킨다. `OVERRIDABLE`을
    // 여기서 걸러야, 모달이 열려 있는 동안 킥이 되돌려져 상태가 뒤로 간 경우에도
    // "그래도 종료"를 누른 적 없는 운영자가 우회 경로로 끌려가지 않는다.
    if (availability === 'OVERRIDABLE' && !options.override) return;
    // 선축은 사이드 id가 아니라 `sideKey`로 보낸다 — 저장되는 곳이 `score.penalties`라
    // 점수(home/away)와 같은 기준틀이어야 하고, 게임별로 달라지는 id를 결과 스냅샷에
    // 박아 두면 나중에 그 값을 읽는 화면이 사이드 목록 없이는 해석할 수 없다.
    const firstKickSideKey = firstKickSideId === awaySide.id ? 'AWAY' : 'HOME';
    const firstKickSide = firstKickSideKey === 'AWAY' ? awaySide : homeSide;
    // 문구는 `options.override`가 아니라 **현재 상태**(`availability`)로 고른다 — 운영자가
    // "그래도 종료"를 누른 뒤 그사이 상태가 결판으로 바뀌었다면 보여줄 것은 평범한 종료
    // 확인이지, 안 끝났다는 경고가 아니다.
    // 확인 문구와 서버 payload가 **같은 숫자**를 쓰게 한 곳에서 센다 — 따로 세면
    // 모달이 보여준 킥 수와 실제로 저장되는 킥 수가 갈릴 수 있다.
    const homeKicks = penaltyKicks.filter((kick) => kick.sideId === homeSide.id).length;
    const awayKicks = penaltyKicks.filter((kick) => kick.sideId === awaySide.id).length;
    const copy =
      availability === 'OVERRIDABLE'
        ? penaltyShootoutOverrideFinishConfirmCopy(
            homeSide,
            awaySide,
            homeScore,
            awayScore,
            homeKicks,
            awayKicks,
            firstKickSide,
          )
        : penaltyShootoutFinishConfirmCopy(homeSide, awaySide, homeScore, awayScore, firstKickSide);
    if (!(await confirm(copy))) return;
    // F65 fix: 예전엔 여기서 곧바로 setPenaltyKicks(null)을 부른 뒤 handleRunCommand를
    // await했다 — 그 사이 네트워크 끊김·409 충돌로 서버 요청이 실패해도 킥 8개와 선축은
    // 이미 지워진 뒤였다(handleRunCommand는 실패를 삼키고 배너만 세울 뿐 이 호출부로
    // 알리지 않았다, 킥 단위 기록은 서버에 없어 복구 불가). 이제 handleRunCommand가
    // 성공 여부를 돌려주므로, **서버가 실제로 받아들였을 때만** 패널을 닫는다 — 실패하면
    // 패널이 그대로 열려 있어 운영자가 재시도하거나 킥을 다시 입력할 필요가 없다.
    const succeeded = await handleRunCommand('end', {
      penalties: {
        home: homeScore,
        away: awayScore,
        firstKickSideKey,
        // 킥 수를 함께 보내야 서버도 같은 술어로 결판을 판정할 수 있다 — 총점 두 개로는
        // "홈 1킥 1:0 / 원정 0킥"과 "각 5킥 1:0"이 같은 값이라, 이게 없으면 화면의
        // 가드가 프런트 단독이 되어 API 직접 호출로 그대로 우회된다.
        takenHome: homeKicks,
        takenAway: awayKicks,
        // 우회로 닫았다는 사실을 **기록에 남긴다**. 서버는 이 값을 `score.penalties`에
        // 그대로 저장하므로 리비전에 영구히 남아, 나중에 "이 결과는 왜 규칙과 다른가"에
        // 답할 수 있다. 규칙대로 끝난 종료에는 싣지 않는다(키 부재가 곧 "우회 아님").
        ...(availability === 'OVERRIDABLE' ? { operatorOverride: true } : {}),
      },
    });
    if (succeeded) {
      setPenaltyKicks(null);
    }
  }, [penaltyKicks, firstKickSideId, penaltyPolicy, gameDetail.data?.sides, confirm, handleRunCommand]);

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
    <div className="mx-auto flex max-w-3xl flex-col gap-4 pb-24 lg:max-w-6xl lg:grid lg:grid-cols-[1.6fr_1fr] lg:items-start lg:gap-6">
      {/* [알파 감사 F] 1280px+ 데스크톱에서 콘텐츠가 상단 1/3에만 몰리고 그 아래가
          광활하게 비어 있다는 실측 지적 — 모바일/태블릿은 기존과 동일한 세로
          스택(flex-col, max-w-3xl)을 그대로 유지하고, lg(1024px)부터만 2열
          grid로 전환한다. 왼쪽(점수·명령·액션 버튼 — 경기 중 빠르게 눌러야
          하는 primary)이 더 넓은 1.6fr, 오른쪽(기록된 이벤트·전송 상태 —
          참고용 secondary, R-D1)이 1fr다. 위→아래로만 쌓지 않고 나란히
          배치해 데스크톱의 남는 세로 공간을 채운다. 두 컬럼 모두 내부에서
          기존과 같은 gap-4 세로 리듬을 유지해 모바일 스택 순서·간격은
          픽셀 단위로 그대로다. */}
      <div className="flex flex-col gap-4">
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
                6px 간격으로 붙어 있어 오탭 위험이 컸다. 되돌릴 수 있는
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
            <div className="flex flex-wrap items-center justify-end gap-2">
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
                        commandPending
                        // [P1-c] 예전에는 라인업 미제출이면 시작 버튼을 비활성화했다.
                        // 그 근거는 "시작하면 기록할 참가자가 없어 막다른 길"이었는데,
                        // 이제 참가자는 대회 등록 명단에서 경기 생성 시점에 이미
                        // 만들어진다 — 제출 여부와 무관하게 항상 있다. 반대로 현장에서
                        // 한 팀이 명단을 못 낸 것만으로 경기를 못 여는 쪽이 실제 문제였다.
                        // 아래 배너는 남긴다: 차단이 아니라 **경고**로 바뀐 것이다.
                      }
                      loading={commandPending}
                      // 사용자 결정("예외 없이 전부") 예외는 `revert-period`
                      // 하나뿐 — 그 자체가 이미 되돌리기라 확인이 없다.
                      onClick={() => void (command === 'revert-period' ? handleRunCommand('revert-period') : confirmAndRunCommand(command))}
                    >
                      {!commandPending ? <Icon size={14} aria-hidden="true" /> : null}
                      {commandLabel(command, currentPeriod?.number ?? null, halftimePeriod?.number ?? null)}
                    </Button>
                  );
                })}
              {availableCommands.includes('end') ? (
                <>
                  {/* 구분선은 왼쪽에 실제로 버튼이 있을 때만 그린다 — 정규 시간 종료 상태에서는
                      availableCommands 가 ['end'] 하나뿐이라, 조건 없이 그리면 세로선이 첫 버튼
                      왼쪽에 홀로 매달린다. */}
                  {availableCommands.some((command) => command !== 'end') ? (
                    <span aria-hidden="true" className="mx-0.5 h-6 w-px shrink-0 bg-[var(--border)]" />
                  ) : null}
                  {/* 과제 2 — 정규시간(+연장) 종료 시 동점인 대회 knockout
                      경기에서는 "경기 종료"를 바로 누르는 대신 승부차기
                      입력으로 먼저 보낸다(`penaltyShootoutEligible` 계산
                      참고). tone을 danger(빨강)가 아니라 primary(파랑)로
                      두는 이유 — 이 버튼 자체는 아직 되돌릴 수 없는 일을
                      하지 않는다(패널을 여는 로컬 전환일 뿐), 진짜
                      되돌릴 수 없는 지점은 패널 안의 "승부차기 종료"다. */}
                  {penaltyShootoutEligible ? (
                    <Button
                      key="penalty-start"
                      size="sm"
                      variant="primary"
                      disabled={!isTakeoverHeld(ops.takeover) || commandPending}
                      onClick={() => void handleStartPenaltyShootout()}
                    >
                      <Target size={14} aria-hidden="true" />
                      승부차기 시작
                    </Button>
                  ) : (
                    <Button
                      key="end"
                      size="sm"
                      variant="danger"
                      // 요구사항 4 — 결선 무승부인데 승부차기가 없으면 누를
                      // 수 없다. 숨기지 않고 비활성 + 아래 배너로 사유를
                      // 설명한다(이 화면의 반복 패턴 ①: 라인업 미제출 시
                      // "경기 시작"을 다루는 방식과 동일).
                      disabled={!isTakeoverHeld(ops.takeover) || commandPending || endBlockedReason !== null}
                      loading={commandPending}
                      onClick={() => void confirmAndRunCommand('end')}
                    >
                      {!commandPending ? <Square size={14} aria-hidden="true" /> : null}
                      {commandLabel('end', currentPeriod?.number ?? null, halftimePeriod?.number ?? null)}
                    </Button>
                  )}
                  {/* 몰수·중단 종료. 정상 종료 버튼과 **같은 위계로 두지 않는다** — 거의
                      쓰이지 않는 예외 경로인데 danger 버튼 둘이 나란히 있으면 현장에서
                      잘못 누른다. outline 보조 버튼으로 한 단 낮추고, 되돌릴 수 없는
                      확정은 다이얼로그 안 "이대로 종료"에서만 일어난다.
                      승부차기 대기 중에는 숨긴다 — 그 상태의 다음 행동은 승부차기 입력이지
                      몰수가 아니고, 둘을 동시에 노출하면 무엇을 눌러야 하는지 흐려진다. */}
                  {!penaltyShootoutEligible ? (
                    <Button
                      key="abnormal-end"
                      size="sm"
                      variant="outline"
                      disabled={!isTakeoverHeld(ops.takeover) || commandPending}
                      onClick={() => setAbnormalEndOpen(true)}
                    >
                      몰수·중단으로 종료
                    </Button>
                  ) : null}
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
            {/* 점수는 이 화면에서 가장 멀리서 확인되는 값이다 — 현장에서는 화면을
                손에 들고 보는 게 아니라 테이블에 두고 곁눈질한다. text-2xl(24px)로는
                옆의 라벨·칩과 무게가 비슷해 한눈에 잡히지 않아 text-4xl 로 올린다.
                양옆에 팀 색 점을 붙여 어느 숫자가 어느 팀인지 읽지 않고 알 수 있게
                하되, 팀 이름은 바로 위 제목 줄("A vs B")에 그대로 있으므로 색만으로
                정보를 전달하지 않는다(R-C3). sides 배열 순서를 그대로 써서 제목 줄과
                좌우 순서가 반드시 일치한다. */}
            <p className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[var(--text-muted)]">스코어</span>
              <span
                className="flex items-center gap-2 text-4xl font-extrabold leading-none tabular-nums text-[var(--text-strong)]"
                aria-label={`스코어 ${sides.map((side) => `${side.displayNameSnapshot} ${scoreBySideId.get(side.id) ?? 0}점`).join(', ')}`}
              >
                {/* 점수 문자열("2 : 1")은 한 텍스트 노드로 유지한다 — 숫자 사이에
                    엘리먼트를 끼우면 화면은 같아 보여도 점수를 읽는 쪽(스크린리더,
                    그리고 이 값을 계약으로 검증하는 테스트)에서 하나의 값으로
                    잡히지 않는다. 팀 색 점은 양옆 바깥에 둔다(좌=홈, 우=원정). */}
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--blue500)]"
                />
                <span>{sides.map((side) => scoreBySideId.get(side.id) ?? 0).join(' : ')}</span>
                {sides.length > 1 ? (
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--orange500)]"
                  />
                ) : null}
              </span>
            </p>
            {/* 승부차기 — 정규시간 점수와 다른 값이라 위 스코어에 섞지 않고 별도 칩으로
                병기한다. 경기가 끝난 뒤에는 경과 시간 칩이 들어올 자리가 비므로 그
                슬롯을 그대로 쓴다(하프타임·정규 시간 종료 칩과 같은 자리·같은 무게).
                aria-label 은 "2:0"이 시각으로 읽히지 않게 점수임을 명시한다. */}
            {confirmedPenalties ? (
              <span
                className="flex items-center gap-2 rounded-lg bg-[var(--blue50)] px-3 py-1 text-sm font-bold tabular-nums text-[var(--blue700)] dark:bg-blue-500/10"
                aria-label={`승부차기 ${sides
                  .map((side) => `${side.displayNameSnapshot} ${penaltyScoreForSide(side, confirmedPenalties)}점`)
                  .join(', ')}${
                  confirmedFirstKicker === null ? '' : `, 선축 ${confirmedFirstKicker.displayNameSnapshot}`
                }`}
              >
                <Target size={16} aria-hidden="true" />
                승부차기{' '}
                {sides.map((side) => penaltyScoreForSide(side, confirmedPenalties)).join(':')}
                {/* 선축은 점수와 함께 결과의 일부다(두 숫자로는 복원되지 않는다). 여기서는
                    사이드 목록이 있으므로 `홈`/`원정` 대신 실제 팀 이름을 쓴다 — 목록형
                    화면(결과 검수·픽스처 목록)은 이름을 갖고 있지 않아
                    `formatGameResultScoreWithPenalties`가 `홈`/`원정`을 쓴다. 선축이 없던
                    시절에 저장된 경기는 이 조각을 아예 그리지 않는다. */}
                {confirmedFirstKicker === null ? null : (
                  <span className="font-semibold">· 선축 {confirmedFirstKicker.displayNameSnapshot}</span>
                )}
              </span>
            ) : null}
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
              <span className="flex items-center gap-2 rounded-lg bg-[var(--blue50)] px-3 py-1 text-sm font-bold text-[var(--blue700)] dark:bg-blue-500/10">
                <Timer size={16} aria-hidden="true" />
                하프타임
              </span>
            ) : regulationEnded ? (
              // 종료 흐름 개편 — 하프타임 칩과 같은 이유로 같은 슬롯을 쓴다:
              // 이 단계에서도 LIVE인 피리어드가 없어 잴 경과 시간이 없는데,
              // 상태 뱃지는 여전히 "진행 중"(게임 자체는 LIVE)이라 이 칩이
              // 없으면 "정규 시간은 끝났고 결과는 아직 확정 전"이라는 사실이
              // 화면 어디에도 드러나지 않는다.
              <span className="flex items-center gap-2 rounded-lg bg-[var(--blue50)] px-3 py-1 text-sm font-bold text-[var(--blue700)] dark:bg-blue-500/10">
                <Timer size={16} aria-hidden="true" />
                정규 시간 종료
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
            {sidesMissingLineup.map((side) => side.displayNameSnapshot).join(', ')} 팀이 아직 선발 명단을
            제출하지 않았어요. 이대로도 경기를 시작할 수 있어요.{' '}
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
        {/* 종료 흐름 개편 — 하프타임과 똑같은 함정이 정규 시간 종료
            단계에도 있다: 여기서도 currentPeriod는 null이라, 아래
            "경기를 시작해 주세요."가 그대로 떠서 방금 후반을 끝낸
            운영자에게 경기가 시작조차 안 됐다고 말하게 된다. 갈라내고,
            다음에 무엇을 해야 하는지(승부차기 입력이 필요한지 여부까지)
            정확히 알린다. */}
        {regulationEnded && (
          <Banner tone="info">
            {penaltyShootoutEligible
              ? '정규 시간이 무승부로 끝났어요. 위 ‘승부차기 시작’으로 결과를 입력해주세요.'
              : '정규 시간이 끝났어요. 기록을 확인한 뒤 위 ‘경기 종료’를 눌러주세요.'}
          </Banner>
        )}
        {/* 요구사항 4 — 결선 무승부인데 승부차기가 없어 "경기 종료"를 막았을
            때 그 사유. 버튼을 숨기지 않고 비활성 + 사유 배너로 설명한다. */}
        {endBlockedReason !== null && availableCommands.includes('end') && (
          <Banner tone="warning">{endBlockedReason}</Banner>
        )}
        {currentPeriod === null &&
          halftimePeriod === null &&
          !regulationEnded &&
          gameState !== 'ENDED' &&
          gameState !== 'CANCELLED' && (
            // [P1-c] 예전에는 라인업 미제출일 때 이 안내를 숨겼다(시작이 막혀 있었으므로).
            // 이제 미제출이어도 시작할 수 있으니 숨길 이유가 없다 -- 위 경고 배너가
            // "아직 안 냈다"를 알리고, 이 배너가 "그래도 시작하면 된다"를 알린다.
            <Banner tone="info">경기를 시작해 주세요.</Banner>
          )}
        {/*
          takeover 가 'revoked' 로 가는 경로는 use-v1-game-operations-console.ts 의
          onPermissionRevoked 하나뿐이고, 그 경로는 서버 리스를 건드리지 않는다 —
          아무도 실제로 인수하지 않았으므로 "다른 운영자가 담당하고 있어요" 는 언제나
          근거 없는 단정이었다. 같은 경로가 확인된 사실만 말하는 배너
          ("운영 권한을 다시 확인하지 못했어요")를 bannerMessage 로 이미 세우므로,
          여기서 별도 배너를 렌더하면 모순되는 안내 두 개가 동시에 뜬다.
        */}
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
          자책골이 추가된 현재는 6개 액션을 모바일 2열·데스크톱 6열로
          균등 배치한다. 골만 2칸을 쓰면 총 7칸이 되어 마지막 액션이 홀로
          다음 줄로 밀리므로, 모든 액션의 크기와 터치 영역을 동일하게 둔다. */}
      <div className="grid grid-cols-2 gap-2 px-4 sm:grid-cols-6">
        {ACTION_BUTTONS.map((button, index) => (
          <Button
            key={`${button.type}-${button.cardColor ?? index}`}
            size="lg"
            variant="outline"
            className="h-16 flex-col gap-1 lg:h-20"
            disabled={!isTakeoverHeld(ops.takeover) || currentPeriod === null}
            onClick={() => handleSelectAction(button)}
          >
            {button.type === 'GOAL' || button.type === 'OWN_GOAL' ? (
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
      <AbnormalEndDialog
        open={abnormalEndOpen}
        submitting={commandPending}
        onCancel={() => setAbnormalEndOpen(false)}
        onConfirm={({ reason, note }: { reason: AbnormalEndReason; note: string }) => {
          setAbnormalEndOpen(false);
          // 점수는 지금 기록된 이벤트 그대로 확정된다 — 서버가 표준 스코어를 대신
          // 정해 주지 않는다(2026-08-23 결정 Q3). 여기서 보내는 건 "정상 종료가
          // 아니다"라는 사실과 그 사유뿐이다.
          void handleRunCommand('end', { outcomeReason: reason, outcomeNote: note });
        }}
      />
      {/* 명단 검인은 **킥오프 전에만** 띄운다. 경기가 시작되면 이 자리는 이벤트 기록이
          차지해야 하고, 그때까지도 안 온 사람은 애초에 라인업에서 빠졌어야 한다.
          takeover 를 쥔 운영자만 조작할 수 있게 하는 것도 다른 액션과 동일하다. */}
      {gameState === 'SCHEDULED' && (
        <ArrivalCheckinPanel
          sides={sides}
          lineups={lineups}
          disabled={!isTakeoverHeld(ops.takeover)}
          pendingParticipantId={setArrival.isPending ? setArrival.variables?.participantId ?? null : null}
          onToggleArrival={({ participantId, arrived }) => {
            setArrival.mutate(
              { participantId, arrived },
              {
                onError: (err) => showToast(extractErrorMessage(err, '검인을 저장하지 못했어요.')),
              },
            );
          }}
        />
      )}

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

      </div>

      {/* [알파 감사 F] 오른쪽 컬럼(secondary) — lg 미만에서는 그냥 다음 섹션으로
          이어져 기존 세로 스택과 동일하다. */}
      <div className="flex flex-col gap-4">
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
          onReverseEvent={(event) => void handleReverseEvent(event)}
          resultOfficialized={resultOfficialized}
        />
      </section>

      {/* 전부 ack 된 평상시에는 이 섹션 자체를 그리지 않는다 — 성공은 위 "기록된
          이벤트"가 이미 보여주므로, 여기는 손이 필요한 것만 남는 자리다. */}
      {hasUnsettledQueueItems(ops.queue.items) && (
        <section className="px-4">
          <h3 className="mb-2 text-sm font-semibold text-[var(--text-strong)]">전송 대기·실패</h3>
          <QueueStatusPanel items={ops.queue.items} onRetry={ops.retryFailedEvent} />
        </section>
      )}
      </div>

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
          teamName={sides.find((side) => side.id === assistTarget.event.sideId)?.displayNameSnapshot}
          whenLabel={`${periodLabel(assistTarget.event.period)} ${formatMatchClock(assistTarget.event.clockMs)}`}
          teammates={teammatesForSide(assistTarget.event.sideId, lineups, assistTarget.event.participantId)}
          onAttach={(assistParticipantId) => attachAssist(assistTarget.event, assistParticipantId)}
          onClose={() => setAssistTarget(null)}
        />
      ) : null}
      {/* 과제 2 — 승부차기 킥 입력 패널. `penaltyKicks !== null`이면 패널이
          열려 있다는 뜻(빈 배열 포함) — `handleStartPenaltyShootout`의
          `setPenaltyKicks([])`가 이 조건을 처음 참으로 만든다. */}
      {penaltyKicks !== null && sides.length === 2 ? (
        <PenaltyShootoutPanel
          sides={sides}
          kicks={penaltyKicks}
          firstKickSideId={firstKickSideId}
          onSelectFirstKicker={setFirstKickSideId}
          onRecordKick={handleRecordPenaltyKick}
          onUndoLastKick={handleUndoPenaltyKick}
          onFinish={(options) => void handleFinishPenaltyShootout(options)}
          onCancel={handleCancelPenaltyShootout}
          regulationScoreBySideId={scoreBySideId}
          policy={penaltyPolicy}
          finishing={commandPending}
        />
      ) : null}
      <EventToasts toasts={toasts} onDismiss={dismiss} />
      {confirmModal}
    </div>
  );
}

/**
 * 승부차기 점수는 `{home, away}` 로 저장되는데 헤더는 `sides` **배열 순서**로 좌우를
 * 정한다(제목 줄 "A vs B"와 순서를 맞추기 위해 홈/원정을 임의로 가정하지 않는다는
 * 기존 규칙). 두 규칙이 어긋나면 정규 점수와 승부차기의 좌우가 뒤바뀌어 보이므로,
 * 배열 순서로 늘어놓되 값은 `sideKey` 로 골라 항상 같은 팀을 가리키게 한다.
 */
function penaltyScoreForSide(
  side: { sideKey: GameSideKey },
  penalties: { home: number; away: number },
): number {
  return side.sideKey === 'HOME' ? penalties.home : penalties.away;
}

/** 테스트 전용 export — 순수 로직이라 OperateConsole 전체를 렌더링하지 않고
 * 이 함수 하나만 검증한다(lineup-revision-state-consistency 회귀 테스트). */
export function teammatesForSide(
  sideId: string | null,
  lineups: readonly GameLineup[],
  excludeParticipantId: string | null,
): readonly GameLineupParticipant[] {
  if (sideId === null) return [];
  // LineupGrid·ArrivalCheckinPanel과 같은 규칙을 재사용한다: SUBMITTED/LOCKED 중
  // 최고 revision만이 "지금 운영 중인 라인업"이다. 여기서 `lineups.find`로 배열의
  // 첫 행(revision desc 정렬이라 DRAFT가 최상단일 수 있다)을 집으면, 팀이 저장만
  // 하고 제출하지 않은 DRAFT의 선수가 어시스트 후보로 올라온다 — 그 선수는
  // LineupGrid에는 아예 보이지 않는데도 후보 목록에는 뜨는 모순이 생긴다.
  const lineup = latestOperableLineup(lineups, sideId);
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
