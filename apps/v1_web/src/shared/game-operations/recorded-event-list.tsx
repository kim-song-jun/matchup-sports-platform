'use client';

import { useId, useState, type ReactNode } from 'react';
import { ChevronDown, Handshake, Pencil, Undo2 } from 'lucide-react';
import { isBackfilledEvent, isBackfilledMinuteUnknown } from '@/lib/backfilled-goal-event';
import { formatKstMeridiemTime } from '@/lib/date-utils';
import {
  collectEventTimeCorrections,
  isTimeCorrectableType,
  isTimeCorrectionRow,
  type EventTimeCorrectionInfo,
} from '@/lib/event-time-correction';
import { formatMatchClock } from '@/lib/game-operations-clock';
import { cardPlayerKey, pairSecondYellowRed, SECOND_YELLOW_RED_LABEL } from '@/lib/second-yellow-red';
import { periodPrefix } from './period-label';
import type { GameEventRecord, GameLineup } from '@/types/game-operations';
import { formatPlayerLabel } from './player-label';
import { participantIdentityName } from './participant-identity';

/** 기록 시각. 회색 바탕 칩에 얹으면 12px 회색 글자가 4.19:1 로 AA 에 못 미쳐 흰 바탕 위 글자로 둔다. */
const TIME_LABEL_CLASS = 'shrink-0 text-[length:var(--font-size-caption)] font-medium tabular-nums text-[var(--text-muted)]';

/** 기록 줄의 「무엇을·누가」 글자. 콘솔은 목록 항목 크기(15/600)로 키운다. */
const EVENT_TEXT_CLASS = {
  boxed: 'text-[length:var(--font-size-body-sm)] font-medium',
  plain: 'text-[length:var(--font-size-body)] font-semibold',
} as const;

/** "수정" 버튼 모양 — 합친 줄(경고 누적 퇴장)의 수정 버튼과 한 이벤트의 수정 버튼이 같은 모양이다. */
const EDIT_BUTTON_CLASS =
  'flex min-h-[44px] shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-[var(--border)] px-2 text-[length:var(--font-size-caption)] font-semibold text-[var(--text-strong)] hover:bg-[var(--surface-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:opacity-40';

/** 경기 콘솔(`appearance="plain"`)의 줄 버튼 — 테두리·아이콘 없는 회색 글자 버튼. 파랑은 콘솔에서 지금 할 일에만 쓴다. */
const PLAIN_ROW_BUTTON_CLASS =
  'flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center whitespace-nowrap rounded-lg px-2 text-[var(--text-muted)] hover:bg-[var(--surface-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:opacity-40';

/**
 * 이벤트 행 왼쪽의 "전반 12:00" 뱃지 문구.
 *
 * 레거시 대회 결과에서 복원된 골(`@/lib/backfilled-goal-event` 참고)은 원본에 전/후반이
 * 없었고 분도 없을 수 있는데, `period`·`clockMs` 가 non-null 컬럼이라 각각 `1`·`0` 으로
 * 저장돼 있다 — 그대로 찍으면 이 화면이 "전반 0:00" 이라고 단정한다. 공개 화면은 서버가
 * 이미 이 값들을 `null` 로 내려 억제하는데, 운영 콘솔만 원시 행을 받아 거짓 주장을
 * 되살리고 있었다. 결과 정정(correction)을 판단하는 화면이라 오히려 더 정확해야 한다.
 */
function eventTimeLabel(event: GameEventRecord, periodCount?: number | null): string {
  if (!isBackfilledEvent(event.payload)) {
    return `${periodPrefix(event.period, periodCount)}${formatMatchClock(event.clockMs)}`;
  }
  // 전/후반은 어느 경우든 모른다. 분은 남아 있으면 그대로 쓴다.
  return isBackfilledMinuteUnknown(event.payload) ? '시각 미상' : formatMatchClock(event.clockMs);
}


/**
 * 이벤트 종류를 훑어볼 때의 보조 신호. **색만으로 뜻을 전하지 않는다** — 바로 옆에
 * `eventTypeLabel`(골/옐로카드/…)이 그대로 붙어 있고, 이 점은 `aria-hidden` 이다.
 * 목록이 길어지면 글자를 하나하나 읽는 대신 색으로 먼저 훑게 된다.
 */
function eventDotClass(event: GameEventRecord): string {
  switch (event.type) {
    case 'GOAL':
    case 'OWN_GOAL':
      return 'bg-[var(--green500)]';
    case 'CARD':
      return event.payload.card === 'RED' ? 'bg-[var(--red500)]' : 'bg-[var(--yellow500)]';
    case 'FOUL':
      return 'bg-[var(--grey400)]';
    case 'SUBSTITUTION':
      return 'bg-[var(--blue500)]';
    default:
      return 'bg-[var(--grey300)]';
  }
}

function participantSuffix(
  event: GameEventRecord,
  playerName: ReadonlyMap<string, string>,
): string {
  if (event.participantId !== null) {
    return playerName.has(event.participantId) ? ' · ' + playerName.get(event.participantId) : '';
  }
  if (event.type === 'GOAL' || event.type === 'OWN_GOAL') return ' · 선수 모름';
  return '';
}

/**
 * 서버에 확정된 경기 이벤트 로그.
 *
 * `QueueStatusPanel` 과 혼동하면 안 된다 — 그쪽은 *이번 세션에서 내가 올린* 전송 큐라
 * 새로고침하면 비어 있다. 이 목록은 `game.snapshot` 이 돌려주는 확정 이벤트라
 * 누가 언제 접속하든 같은 것을 본다.
 *
 * 선수 이름은 라인업 스냅샷에서 participantId 로 되짚는다. 라인업이 아직 없거나
 * 해당 참가자가 빠진 경우 이름을 지어내지 않고 팀명만 남긴다.
 */
export function RecordedEventList({
  events: history,
  sides,
  lineups,
  onAttachAssist,
  onEditEvent,
  onReverseEvent,
  onReverseSubstitution,
  resultOfficialized,
  disabled = false,
  order = 'chronological',
  periodCount,
  maxRows,
  compact = false,
  appearance = 'boxed',
}: {
  readonly events: readonly GameEventRecord[];
  /** 이 목록이 실제로 읽는 건 `id`·`displayNameSnapshot` 둘뿐이라 구조적
   * 최소 계약으로 받는다 — 결과 검토 화면이 넘기는
   * `TournamentGameDetail['sides']`(createdAt/updatedAt 없는 클라이언트
   * 미러)도 같은 렌더러를 그대로 쓸 수 있게 하기 위함이다. */
  readonly sides: ReadonlyArray<{ id: string; displayNameSnapshot: string }>;
  readonly lineups: readonly GameLineup[];
  /** 정규 피리어드 수. 1이면 기록 시각 앞에 "전반"을 붙이지 않는다. */
  readonly periodCount?: number | null;
  readonly onAttachAssist?: (event: GameEventRecord) => void;
  /**
   * MD-QA #187: "수정" — 시각 정정(과 기록 취소)을 한 시트에서 고르는 진입점. 시각을 고칠 수 있는 기록에만
   * 뜨고, 그렇지 않은 기록(레거시 백필 골 등)은 `onReverseEvent` 의 "수정·취소"로 물러난다.
   *
   * 경고 누적 퇴장으로 합친 줄은 수정 버튼이 하나이고, 레드를 `event` 로, 함께 옮겨질 두 번째 옐로를
   * `linkedEvents` 로 넘긴다 — 둘은 같은 순간의 기록이라 시각을 같이 옮겨야 줄이 갈라지지 않는다.
   */
  readonly onEditEvent?: (event: GameEventRecord, linkedEvents?: readonly GameEventRecord[]) => void;
  /** 빠른 교체 모드의 오조작 복구 경로 — 되돌리기 버튼은 아직 되돌려지지
   * 않은 SUBSTITUTION 이벤트에만 뜬다. 새 되돌리기 API가 아니라 기존
   * `GamesService.reverseEvent`(CORRECTION) 를 그대로 호출한다. */
  readonly onReverseEvent?: (event: GameEventRecord) => void;
  /** @deprecated 새 호출부는 모든 수정 가능 이벤트를 받는 onReverseEvent를 사용한다. */
  readonly onReverseSubstitution?: (event: GameEventRecord) => void;
  readonly disabled?: boolean;
  /**
   * F66 fix: 결과가 OFFICIAL로 확정된 뒤에는 서버도 reverseEvent를 409
   * RESULT_ALREADY_OFFICIAL로 거부한다(games.service.ts) — 이 플래그가 없으면 확정 후에도
   * 되돌리기 버튼이 그대로 눌려서, 사용자가 눌러 본 뒤에야 실패를 알게 된다("눌러 보고
   * 403을 받는 버튼은 만들지 않는다" 규약, videos-page-client.tsx와 동일). 넘기지 않으면
   * (호출부가 아직 반영 전이면) 기존 동작 그대로 항상 노출한다 — back-compat.
   */
  readonly resultOfficialized?: boolean;
  /**
   * 콘솔은 방금 한 일이 맨 위에 있어야 한다(`newest-first`) — 경기 중 방금 넣은 골의 어시스트를
   * 이벤트가 쌓인 목록의 맨 아래에서 찾게 하지 않는다. 결과 검토·공개 화면은 경기 흐름대로 읽는
   * 시간순(`chronological`, 기본값)을 유지한다. 순서는 서버가 준 `sequence` 순서를 뒤집기만 한다.
   */
  readonly order?: 'chronological' | 'newest-first';
  /** 보이는 순서에서 위 N줄만 그린다. 경고 누적 퇴장처럼 합친 줄은 한 줄로 센다. */
  readonly maxRows?: number;
  /**
   * 폰 첫 화면용 한 줄 표시. 줄마다 버튼을 하나만 두고(어시스트가 없는 골은 어시스트, 나머지는 고치기),
   * 취소된 기록과 「기록 취소」 줄·고친 기록 이력은 빼서 줄 높이를 48px 로 묶는다. 전부 보는 곳은 기본 표시다.
   */
  readonly compact?: boolean;
  /**
   * `boxed`(기본): 테두리 상자 안의 줄 목록, 종류·팀 색 점과 테두리 버튼. 결과 검토 화면이 쓴다.
   * `plain`: 경기 콘솔 — 흰 카드 안에 놓이는 줄이라 바깥 상자·색 점이 없고, 버튼은 회색 글자 버튼이다.
   */
  readonly appearance?: 'boxed' | 'plain';
}) {
  const plain = appearance === 'plain';
  const lastReset = history.reduce((sequence, event) =>
    event.type === 'CORRECTION' && event.payload?.reason === '경기 시작 취소' && typeof event.payload.commandId === 'string'
      ? Math.max(sequence, event.sequence) : sequence, 0);
  const events = lastReset ? history.filter(event => event.sequence > lastReset) : history;
  if (events.length === 0) {
    return (
      <p className="px-1 py-3 text-xs text-[var(--text-muted)]">
        아직 기록이 없어요.
      </p>
    );
  }

  const sideName = new Map(sides.map((side) => [side.id, side.displayNameSnapshot]));
  /**
   * 팀 색. 예전에는 "색으로 팀을 구분하면 색만으로 의미를 전달하게 된다"는 이유로 색을
   * 아예 쓰지 않고 굵기로만 대비를 올렸다. 그 판단의 핵심은 *색만으로* 였다 — 팀 이름은
   * 그대로 두고 색을 **덧붙이면** R-C3 를 지키면서 훑어보기만 빨라진다. 실화면에서 양 팀이
   * 같은 회색 텍스트로만 갈려 "어느 팀 골이었지"를 매번 읽어야 했다(2026-08-18 확인).
   * 홈=파랑 / 원정=주황 — 색상환 179° 차이라 색각 이상에서도 갈린다.
   */
  const homeSideId = sides[0]?.id ?? null;
  /** 팀 색은 "이 이벤트가 어느 팀 것인가"를 말하는 신호다 — 그걸 판별할 수 없는
   *  상태에서 한쪽 색을 칠하면 없는 정보를 지어내는 셈이 된다. `sides`가 아직
   *  로드되지 않았거나(첫 렌더) 이벤트에 팀이 없으면(팀 단위 파울 등) 중립
   *  테두리색으로 물러난다 — 그때는 옆의 팀 이름도 비어 있어 색만 남는다. */
  const teamAccent = (sideId: string | null): 'home' | 'away' | 'unknown' => {
    if (sideId === null || homeSideId === null) return 'unknown';
    return sideId === homeSideId ? 'home' : 'away';
  };
  const playerName = new Map(
    lineups.flatMap((lineup) =>
      lineup.participants.map((participant) => [
        participant.id,
        formatPlayerLabel(participant.jerseyNumber, participantIdentityName(participant)),
      ]),
    ),
  );
  // 원본 이벤트는 immutable history로 남긴다. 되돌려진 원본에는 명시적인 상태
  // 라벨을 붙이고, 어시스트·추가 수정 액션만 막는다.
  const reversedIds = new Set(
    events.flatMap((event) => (typeof event.reversesEventId === 'string' ? [event.reversesEventId] : [])),
  );

  // MD-QA #187: 시각 정정 행(TIME_CORRECTION)은 목록의 한 줄이 아니라 원본 줄의 "정정됨" 이력이다.
  const corrections = collectEventTimeCorrections(events);
  const visibleEvents = events.filter((event) => !isTimeCorrectionRow(event));
  // 증분 수신 직후엔 원본의 clockMs 가 옛 값일 수 있어 가장 최근 정정 행의 시각을 우선한다.
  const currentOf = (listedEvent: GameEventRecord) => {
    const correction = corrections.get(listedEvent.id) ?? null;
    return { correction, event: correction === null ? listedEvent : { ...listedEvent, clockMs: correction.currentClockMs } };
  };
  // 같은 선수의 두 번째 옐로와 같은 시각의 레드(경고 누적 퇴장)는 레드 한 줄로 합친다 — 저장은 이벤트 둘 그대로이고
  // 표시만 합친다(`@/lib/second-yellow-red`). 시각 정정 뒤의 시각으로 비교하고, 되돌려진 기록은 합치지 않는다.
  const secondYellowRed = pairSecondYellowRed(visibleEvents, (event) => {
    if (event.type !== 'CARD' || isBackfilledEvent(event.payload)) return null;
    const color = event.payload.card;
    return {
      color: color === 'YELLOW' || color === 'RED' ? color : null,
      playerKey: cardPlayerKey({ participantId: event.participantId }),
      sideKey: event.sideId,
      period: event.period,
      clockMs: currentOf(event).event.clockMs,
      cancelled: reversedIds.has(event.id),
    };
  });
  const listedEvents = visibleEvents.filter(
    (event) =>
      !secondYellowRed.absorbedYellows.has(event) &&
      !(compact && (event.type === 'CORRECTION' || reversedIds.has(event.id))),
  );
  const sortedEvents = order === 'newest-first' ? [...listedEvents].reverse() : listedEvents;
  const orderedEvents = maxRows === undefined ? sortedEvents : sortedEvents.slice(0, maxRows);
  const reverseHandler = onReverseEvent ?? onReverseSubstitution;
  /** 버튼 안쪽. 콘솔은 아이콘 없이 글자만 두고, 글자 크기는 span 에 준다(전역 `button { font: inherit }`). */
  const buttonContent = (icon: ReactNode, label: string) =>
    plain ? (
      <span className="text-[length:var(--font-size-label)] font-semibold">{label}</span>
    ) : (
      <>
        {icon}
        {label}
      </>
    );

  /**
   * 종류 점. 경고 누적 퇴장은 옐로 위에 레드를 겹친 점이다 — 장식이라 `aria-hidden` 이고, 뜻은 옆의 글자가 전한다.
   * 콘솔(`plain`)은 색을 지금 할 일에만 쓰므로 점을 그리지 않는다.
   */
  const eventDot = (event: GameEventRecord, merged: boolean) =>
    plain ? null : merged ? (
      <span aria-hidden="true" className="relative h-2.5 w-4 shrink-0">
        <span className="absolute left-1.5 top-0 h-2.5 w-2.5 rounded-full bg-[var(--red500)]" />
        <span className="absolute left-0 top-0 h-2.5 w-2.5 rounded-full bg-[var(--yellow500)] ring-2 ring-[var(--card-surface)]" />
      </span>
    ) : (
      <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${eventDotClass(event)}`} />
    );

  /**
   * 한 이벤트의 액션 버튼들(어시스트·수정·되돌리기). 합친 줄(경고 누적 퇴장)은 옐로와 레드가 각자 시각 정정·취소를
   * 해야 하므로 `actionPrefix`("옐로"/"레드")로 글자를 구분해 버튼을 둘 낸다 — 어느 기록을 고치는지 글자로 알린다.
   */
  const renderActions = (listedEvent: GameEventRecord, actionPrefix: string | null, single = false) => {
    const { event } = currentOf(listedEvent);
    const canAttachAssist =
      onAttachAssist !== undefined &&
      resultOfficialized !== true &&
      event.type === 'GOAL' &&
      event.assistParticipantId === null &&
      event.participantId !== null &&
      !reversedIds.has(event.id);
    const canReverse =
      reverseHandler !== undefined &&
      resultOfficialized !== true &&
      (onReverseEvent !== undefined || event.type === 'SUBSTITUTION') &&
      ['GOAL', 'OWN_GOAL', 'CARD', 'FOUL', 'SUBSTITUTION'].includes(event.type) &&
      !reversedIds.has(event.id);
    const canEditTime =
      onEditEvent !== undefined &&
      resultOfficialized !== true &&
      isTimeCorrectableType(event.type) &&
      !isBackfilledEvent(event.payload) &&
      !reversedIds.has(event.id);
    // 44px 최소 터치 타깃(WCAG 2.5.5 유사 기준) — 이 콘솔의 실사용 맥락은 경기장에서 한 손으로 급하게 조작하는 것이라,
    // 반복 눌리는 CTA가 44px 미만이면 오탭 위험이 커진다.
    // 어시스트는 되돌리기와 같은 행 안쪽 액션 자리에 둔다 — 행 아래 전체 폭 밴드는 행 높이가 들쭉날쭉해지고 강조색 면적이 커진다(R-C1).
    const assistButton = canAttachAssist ? (
      <button
        type="button"
        disabled={disabled}
        onClick={() => onAttachAssist(event)}
        aria-label="이 골에 어시스트 추가"
        className={
          plain
            ? PLAIN_ROW_BUTTON_CLASS
            : 'flex min-h-[44px] shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-2 text-xs font-semibold text-[var(--blue700)] hover:bg-[var(--blue50)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500'
        }
      >
        {buttonContent(<Handshake size={12} aria-hidden="true" />, '어시스트')}
      </button>
    ) : null;
    const editButton = canEditTime ? (
      <button
        type="button"
        disabled={disabled}
        onClick={() => onEditEvent?.(listedEvent)}
        aria-label={`기록 고치기 (${eventTypeLabel(event)})`}
        className={plain ? PLAIN_ROW_BUTTON_CLASS : EDIT_BUTTON_CLASS}
      >
        {buttonContent(<Pencil size={12} aria-hidden="true" />, actionPrefix === null ? '고치기' : `${actionPrefix} 고치기`)}
      </button>
    ) : canReverse ? (
      <button
        type="button"
        disabled={disabled}
        onClick={() => reverseHandler?.(event)}
        className={
          plain
            ? PLAIN_ROW_BUTTON_CLASS
            : 'flex min-h-[44px] shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-[var(--border)] px-2 text-xs font-semibold text-[var(--text-muted)] hover:bg-[var(--surface-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500'
        }
      >
        {buttonContent(
          <Undo2 size={12} aria-hidden="true" />,
          event.type === 'SUBSTITUTION' ? '되돌리기' : actionPrefix === null ? '고치기' : `${actionPrefix} 고치기`,
        )}
      </button>
    ) : null;
    // 한 줄 표시에는 버튼 하나만 둔다 — 방금 넣은 골의 어시스트가 먼저다.
    if (single) return assistButton ?? editButton;
    return (
      <>
        {assistButton}
        {editButton}
      </>
    );
  };

  /** 합친 줄(경고 누적 퇴장)의 수정 버튼 — 옐로와 레드는 같은 순간의 기록이라 시각을 같이 옮긴다. */
  const mergedEditButton = (redEvent: GameEventRecord, yellowEvent: GameEventRecord) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onEditEvent?.(redEvent, [yellowEvent])}
      aria-label={`기록 고치기 (${SECOND_YELLOW_RED_LABEL})`}
      className={plain ? PLAIN_ROW_BUTTON_CLASS : EDIT_BUTTON_CLASS}
    >
      {buttonContent(<Pencil size={12} aria-hidden="true" />, '고치기')}
    </button>
  );

  return (
    <>
    <ul
      className={
        plain
          ? 'flex flex-col divide-y divide-[var(--border)]'
          : 'flex flex-col divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card-surface)]'
      }
      aria-label="기록 목록"
    >
      {orderedEvents.map((listedEvent) => {
        // 경고 누적 퇴장이면 이 줄은 레드이고, `mergedYellow` 가 그 레드가 흡수한 두 번째 옐로다.
        const mergedYellow = secondYellowRed.yellowOfRed.get(listedEvent) ?? null;
        const { correction, event } = currentOf(listedEvent);
        if (compact) {
          const teamName = event.sideId === null ? undefined : sideName.get(event.sideId);
          const action =
            mergedYellow === null
              ? renderActions(listedEvent, null, true)
              : onEditEvent !== undefined && resultOfficialized !== true
                ? mergedEditButton(listedEvent, mergedYellow)
                : renderActions(listedEvent, '레드', true);
          return (
            <li key={event.id} className={`flex min-h-[48px] items-center gap-2 ${plain ? '' : 'px-3'}`}>
              <span className={`${TIME_LABEL_CLASS} min-w-16`}>{eventTimeLabel(event, periodCount)}</span>
              {eventDot(event, mergedYellow !== null)}
              {/* 줄이 길면 팀 이름부터 잘린다 — 누가 했는지가 먼저 남아야 한다. */}
              <p className={`min-w-0 flex-1 truncate text-[var(--text-strong)] ${EVENT_TEXT_CLASS[appearance]}`}>
                {mergedYellow !== null ? SECOND_YELLOW_RED_LABEL : eventTypeLabel(event)}
                {event.type === 'SUBSTITUTION'
                  ? substitutionDetailSuffix(event, playerName)
                  : participantSuffix(event, playerName) + assistSuffix(event, playerName)}
                {teamName ? (
                  <span className="text-[length:var(--font-size-caption)] font-normal text-[var(--text-muted)]"> · {teamName}</span>
                ) : null}
              </p>
              {action}
            </li>
          );
        }
        const yellowCurrent = mergedYellow === null ? null : currentOf(mergedYellow);
        const isReversed = reversedIds.has(event.id);
        const actions =
          mergedYellow === null ? (
            renderActions(listedEvent, null)
          ) : onEditEvent !== undefined && resultOfficialized !== true ? (
            /* 합친 줄은 수정 버튼이 하나다 — 옐로와 레드는 같은 순간의 기록이라 시각을 같이 옮긴다.
               기록 취소는 시트의 "기록 취소" 탭에서 레드만/모두로 갈린다. */
            mergedEditButton(listedEvent, mergedYellow)
          ) : (
            /* 시각 수정이 없는 화면(취소만 되는 곳)은 옐로·레드를 각각 취소할 수 있게 둘을 낸다. */
            <>
              {renderActions(mergedYellow, '옐로')}
              {renderActions(listedEvent, '레드')}
            </>
          );
        const eventText = (
          <>
            {mergedYellow !== null ? SECOND_YELLOW_RED_LABEL : eventTypeLabel(event)}
            {isReversed ? <span className="font-semibold text-[var(--text-muted)]"> · 취소된 기록</span> : null}
            {event.type === 'SUBSTITUTION'
              ? substitutionDetailSuffix(event, playerName)
              : participantSuffix(event, playerName) + assistSuffix(event, playerName)}
          </>
        );
        const teamName = event.sideId ? (sideName.get(event.sideId) ?? '') : '';
        const disclosures = (
          <>
            {yellowCurrent !== null && yellowCurrent.correction !== null ? (
              <EventTimeCorrectionDisclosure
                plain={plain}
                correction={yellowCurrent.correction}
                originalLabel={`${periodPrefix(yellowCurrent.event.period, periodCount)}${formatMatchClock(yellowCurrent.correction.originalClockMs)}`}
              />
            ) : null}
            {correction !== null ? (
              <EventTimeCorrectionDisclosure
                plain={plain}
                correction={correction}
                originalLabel={`${periodPrefix(event.period, periodCount)}${formatMatchClock(correction.originalClockMs)}`}
              />
            ) : null}
          </>
        );
        if (plain) {
          // 콘솔: 시각 · 무엇을·누가(팀은 글자 끝에 회색으로) · 버튼을 한 줄에 둔다. 좁으면 글자만 줄을 늘리고 자르지 않는다.
          return (
            <li key={event.id} className="flex flex-col gap-1 py-2">
              <div className="flex min-h-11 items-center gap-2">
                <span className={`${TIME_LABEL_CLASS} min-w-16`}>{eventTimeLabel(event, periodCount)}</span>
                <p
                  className={`min-w-0 flex-1 break-keep text-[var(--text-strong)] ${EVENT_TEXT_CLASS.plain}`}
                  style={{ overflowWrap: 'anywhere' }}
                >
                  {eventText}
                  {teamName ? (
                    <span className="text-[length:var(--font-size-caption)] font-normal text-[var(--text-muted)]"> · {teamName}</span>
                  ) : null}
                </p>
                <div className="flex shrink-0 items-center gap-1">{actions}</div>
              </div>
              {disclosures}
            </li>
          );
        }
        return (
          <li
            key={event.id}
            className="flex items-stretch gap-2 px-3 py-2"
          >
            <div className="@container flex min-w-0 flex-1 flex-col gap-2">
            {/* 좁은 폭에서는 위아래로 쌓는다. 한 줄로 두면 액션 묶음(어시스트·
                되돌리기·팀명)이 shrink-0 이라 폭을 먼저 가져가고, 남은 자리에서
                이벤트 문구가 잘려 "골 · 1 김..." 처럼 선수 이름이 사라졌다(알파
                390px 실측). 이 목록에서 가장 중요한 정보가 "누가 했는지"인데 그게
                제일 먼저 잘리는 셈이라, 폭이 부족하면 자르는 대신 줄을 나눈다.

                **뷰포트가 아니라 컨테이너 폭으로 판단한다**(`@container` + `@md:`).
                예전엔 `sm:`(뷰포트 640px)을 썼는데, 이 목록은 데스크톱에서 **넓은 화면
                안의 좁은 사이드바 컬럼**에 들어간다. 뷰포트는 1440px이라 `sm:` 이 켜져
                한 줄로 배치되지만 실제 컬럼은 그만큼 넓지 않아, 문구가 통째로 사라졌다
                (2026-08-19 alpha 실측: 1024·1280px 에서 `clientWidth 0 / scrollWidth 136`,
                화면에는 `전반 5:00 ● 자… [수정·취소] ● 팀명` 만 남았다).
                자책골(#568)이 `되돌리기`를 GOAL/OWN_GOAL/CARD/FOUL 전 행으로 넓히면서
                드러났지만, 잘리는 것은 자책골 행만이 아니라 **그 네 종류 전부**였다. */}
            <div className="flex flex-col gap-1 @md:flex-row @md:items-center @md:justify-between @md:gap-2">
              <div className="flex min-w-0 items-center gap-2">
                {/* clockMs 는 항상 정상이었다 — 표시만 분 단위(`m'`)로 뭉개서 같은 분에
                    찍힌 여러 이벤트를 구분할 수 없었다(실측 사고 사후조사에서 확인:
                    645886/649891/652602/655603ms 가 전부 "10'"로 보였다). 초까지 보여
                    구분 가능하게 한다 — ms 는 여기서는 산만하기만 하다(초 단위로 이미
                    충분히 구분되고, 커맨드 왕복 지연처럼 액션 가능한 값이 아니다). */}
                <span className={TIME_LABEL_CLASS}>{eventTimeLabel(event, periodCount)}</span>
                {eventDot(event, mergedYellow !== null)}
                {/* 좁은 컨테이너에서는 **자르지 말고 줄을 늘린다.** 이 목록에서 가장 중요한 정보가
                    "무엇을·누가"인데, 문단 가용폭이 390:205 · 1024:114 · 1280:213 px 라(2026-08-20 alpha 실측)
                    평범한 `골 · 10 {이름} (도움 7 {이름})` 도 두 줄이 정상이다. 예전엔 두 줄까지만 허용했지만
                    (`line-clamp-2`), 운영진에게 `실명 (닉네임)` 으로 이름이 길어지면서(2026-10-18) 두 줄로도
                    잘려 줄 수 제한을 없앴다 — 행이 길어지는 대가로 이름을 잃지 않는다. */}
                <p className={`min-w-0 break-words text-[var(--text-strong)] ${EVENT_TEXT_CLASS.boxed}`}>{eventText}</p>
              </div>
              <div className="flex min-w-0 flex-wrap items-center justify-start gap-2 @md:justify-end">
                {actions}
                {/* 팀 귀속은 기록자가 매 행에서 즉시 확인해야 하는 정보인데, 행에서
                    가장 약하게 표현돼 있었다(11px·regular·muted, 우측 끝 — 알파 390px
                    실측). 색을 더 쓰지 않고(R-C1) 굵기로만 대비를 올린다 — 색으로
                    팀을 구분하면 색만으로 의미를 전달하게 돼 R-C3 에 걸린다. */}
                <span className="flex min-w-0 basis-full items-center gap-1 break-words text-xs font-medium text-[var(--text-muted)] @md:basis-auto">
                  {teamAccent(event.sideId) === 'unknown' ? null : (
                    <span
                      aria-hidden="true"
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        teamAccent(event.sideId) === 'home' ? 'bg-[var(--blue500)]' : 'bg-[var(--orange500)]'
                      }`}
                    />
                  )}
                  {teamName}
                </span>
              </div>
            </div>
            {disclosures}
            </div>
          </li>
        );
      })}
    </ul>
    </>
  );
}

function correctionActorLabel(lane: 'OPERATOR' | 'PLATFORM_ADMIN' | null): string {
  return lane === 'PLATFORM_ADMIN' ? '플랫폼 관리자' : '운영진';
}

/**
 * MD-QA #187 — "정정됨" 펼침. 처음 기록 시각과 정정 이력(누가·언제)을 보여 준다.
 * 44px 터치 타깃, 상태는 `aria-expanded` 와 글자("정정됨")로 전한다 — 색에 기대지 않는다.
 */
function EventTimeCorrectionDisclosure({
  correction,
  originalLabel,
  plain,
}: {
  readonly correction: EventTimeCorrectionInfo;
  readonly originalLabel: string;
  readonly plain: boolean;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className={`flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-[length:var(--font-size-caption)] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 ${
          plain ? 'text-[var(--text-muted)] hover:bg-[var(--surface-soft)]' : 'text-[var(--blue700)] hover:bg-[var(--blue50)]'
        }`}
      >
        고친 기록
        <ChevronDown
          size={14}
          aria-hidden="true"
          className={`transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open ? (
        <div id={panelId} className="flex w-full flex-col gap-1 rounded-lg bg-[var(--surface-soft)] px-3 py-2.5">
          {correction.steps.map((step) => {
            const when = formatKstMeridiemTime(step.at);
            return (
              <p key={`${step.at}-${step.clockMs}`} className="text-[length:var(--font-size-caption)] text-[var(--text-body)]">
                <span className="font-bold tabular-nums">
                  {formatMatchClock(step.previousClockMs)} → {formatMatchClock(step.clockMs)}
                </span>
                {' · '}
                {correctionActorLabel(step.lane)}
                {when !== null ? ` · ${when}` : ''}
                {step.lane === 'PLATFORM_ADMIN' && step.reason !== null ? ` · 사유: ${step.reason}` : ''}
              </p>
            );
          })}
          <p className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">처음 기록: {originalLabel}</p>
        </div>
      ) : null}
    </div>
  );
}

/** "9 조현우 → 10 홍길동" — 나가는 선수와 들어오는 선수를 모두 보여준다.
 * `event.participantId`는 들어오는(IN) 선수, `payload.outParticipantId`는
 * 나가는(OUT) 선수다(`action-target-picker.tsx`의 커밋 계약과 동일). 라인업
 * 스냅샷에 없는 참가자는 이름을 지어내지 않고 그 절반만 비운다. */
function substitutionDetailSuffix(event: GameEventRecord, playerName: Map<string, string>): string {
  const outParticipantId =
    typeof event.payload.outParticipantId === 'string' ? event.payload.outParticipantId : null;
  const outName = outParticipantId !== null ? playerName.get(outParticipantId) : undefined;
  const inName = event.participantId !== null ? playerName.get(event.participantId) : undefined;
  if (outName !== undefined && inName !== undefined) return ` · ${outName} → ${inName}`;
  if (inName !== undefined) return ` · → ${inName}`;
  if (outName !== undefined) return ` · ${outName} →`;
  return '';
}

/** "(도움 10 김철수)" — 골에 기록된 도움 선수. 결과 검토자가 승인/반려의
 * 근거로 확인해야 하는 정보라 목록에 함께 보여준다. 라인업 스냅샷에 없는
 * 참가자는 이름을 지어내지 않고 생략한다(득점자와 같은 규칙). */
function assistSuffix(event: GameEventRecord, playerName: Map<string, string>): string {
  if (event.type !== 'GOAL' || event.assistParticipantId === null) return '';
  const name = playerName.get(event.assistParticipantId);
  return name === undefined ? '' : ` (도움 ${name})`;
}

export function eventTypeLabel(event: GameEventRecord): string {
  switch (event.type) {
    case 'GOAL':
      return '골';
    case 'OWN_GOAL':
      return '자책골';
    case 'CARD':
      return event.payload.card === 'RED' ? '레드카드' : '옐로카드';
    case 'FOUL':
      return '파울';
    case 'SUBSTITUTION':
      return '교체';
    case 'CORRECTION':
      return '기록 취소';
    case 'TIME_CORRECTION':
      return '시각 고치기';
    default:
      return event.type;
  }
}
