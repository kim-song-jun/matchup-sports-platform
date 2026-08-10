'use client';

import { Handshake, Undo2 } from 'lucide-react';
import { formatMatchClock } from '@/lib/game-operations-clock';
import { periodLabel } from './period-label';
import type { GameEventRecord, GameLineup, GameSide } from '@/types/game-operations';

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
  events,
  sides,
  lineups,
  onAttachAssist,
  onReverseSubstitution,
}: {
  readonly events: readonly GameEventRecord[];
  readonly sides: readonly GameSide[];
  readonly lineups: readonly GameLineup[];
  readonly onAttachAssist?: (event: GameEventRecord) => void;
  /** 빠른 교체 모드의 오조작 복구 경로 — 되돌리기 버튼은 아직 되돌려지지
   * 않은 SUBSTITUTION 이벤트에만 뜬다. 새 되돌리기 API가 아니라 기존
   * `GamesService.reverseEvent`(CORRECTION) 를 그대로 호출한다. */
  readonly onReverseSubstitution?: (event: GameEventRecord) => void;
}) {
  if (events.length === 0) {
    return (
      <p className="px-1 py-3 text-2xs text-gray-400 dark:text-gray-500">
        아직 기록된 이벤트가 없어요.
      </p>
    );
  }

  const sideName = new Map(sides.map((side) => [side.id, side.displayNameSnapshot]));
  const playerName = new Map(
    lineups.flatMap((lineup) =>
      lineup.participants.map((participant) => [
        participant.id,
        `${participant.jerseyNumber ?? '-'} ${participant.displayNameSnapshot}`,
      ]),
    ),
  );
  // reverseEvent로 이미 되돌려진 이벤트는 목록에서 흐리게 표시할 필요는 없다(서버가
  // 새 CORRECTION 행만 추가할 뿐 원본을 지우지 않으므로) — 다만 되돌려진 GOAL에는
  // "+ 어시스트"를 붙이지 않는다(더는 유효한 득점이 아니다).
  const reversedIds = new Set(
    events.filter((event) => event.reversesEventId !== null).map((event) => event.reversesEventId),
  );

  return (
    <ul className="flex flex-col gap-1.5" aria-label="기록된 이벤트 목록">
      {events.map((event) => {
        const canAttachAssist =
          onAttachAssist !== undefined &&
          event.type === 'GOAL' &&
          event.assistParticipantId === null &&
          event.participantId !== null &&
          !reversedIds.has(event.id);
        const canReverseSubstitution =
          onReverseSubstitution !== undefined && event.type === 'SUBSTITUTION' && !reversedIds.has(event.id);
        return (
          <li
            key={event.id}
            className="flex flex-col gap-1.5 rounded-lg border border-gray-100 px-3 py-2 dark:border-gray-700"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                {/* clockMs 는 항상 정상이었다 — 표시만 분 단위(`m'`)로 뭉개서 같은 분에
                    찍힌 여러 이벤트를 구분할 수 없었다(실측 사고 사후조사에서 확인:
                    645886/649891/652602/655603ms 가 전부 "10'"로 보였다). 초까지 보여
                    구분 가능하게 한다 — ms 는 여기서는 산만하기만 하다(초 단위로 이미
                    충분히 구분되고, 커맨드 왕복 지연처럼 액션 가능한 값이 아니다). */}
                <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-2xs font-medium tabular-nums text-gray-600 dark:bg-white/10 dark:text-gray-300">
                  {periodLabel(event.period)} {formatMatchClock(event.clockMs)}
                </span>
                <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                  {eventTypeLabel(event)}
                  {event.type === 'SUBSTITUTION'
                    ? substitutionDetailSuffix(event, playerName)
                    : event.participantId && playerName.has(event.participantId)
                      ? ` · ${playerName.get(event.participantId)}`
                      : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {/* 44px 최소 터치 타깃(WCAG 2.5.5 유사 기준) — 이 콘솔의 실사용
                    맥락은 경기장에서 한 손으로 급하게 조작하는 것이라, 반복
                    눌리는 CTA가 44px 미만이면 오탭 위험이 커진다(Copilot 리뷰
                    지적: 되돌리기 32px). */}
                {/* 어시스트 — 예전엔 행 아래에 깔리는 전체 폭 파란 밴드였다.
                    골이 있는 행마다 밴드가 붙으니 목록이 "행 / 행+밴드"로
                    들쭉날쭉해져 훑어보기 어려웠고(오너 지적: "어시스트 버튼
                    너무 구리다"), 강조색 면적도 커서 R-C1(단일 액센트) 위계를
                    흐렸다. 되돌리기와 같은 행 안쪽 액션 자리로 옮겨 모든 행의
                    높이·구조를 동일하게 만들고, 색은 텍스트에만 남긴다. */}
                {canAttachAssist ? (
                  <button
                    type="button"
                    onClick={() => onAttachAssist(event)}
                    aria-label="이 골에 어시스트 추가"
                    className="flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-2xs font-semibold text-blue-600 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-blue-400 dark:hover:bg-blue-500/10"
                  >
                    <Handshake size={12} aria-hidden="true" />
                    어시스트
                  </button>
                ) : null}
                {canReverseSubstitution ? (
                  <button
                    type="button"
                    onClick={() => onReverseSubstitution(event)}
                    className="flex min-h-[44px] items-center gap-1 rounded-lg border border-gray-200 px-2 text-2xs font-semibold text-gray-500 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700"
                  >
                    <Undo2 size={12} aria-hidden="true" />
                    되돌리기
                  </button>
                ) : null}
                <span className="text-2xs text-gray-500 dark:text-gray-400">
                  {event.sideId ? (sideName.get(event.sideId) ?? '') : ''}
                </span>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
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

function eventTypeLabel(event: GameEventRecord): string {
  switch (event.type) {
    case 'GOAL':
      return '골';
    case 'CARD':
      return event.payload.card === 'RED' ? '레드카드' : '옐로카드';
    case 'FOUL':
      return '파울';
    case 'SUBSTITUTION':
      return '교체';
    case 'CORRECTION':
      return '정정';
    default:
      return event.type;
  }
}
