'use client';

import { Handshake, Undo2 } from 'lucide-react';
import { isBackfilledEvent, isBackfilledMinuteUnknown } from '@/lib/backfilled-goal-event';
import { formatMatchClock } from '@/lib/game-operations-clock';
import { periodLabel } from './period-label';
import type { GameEventRecord, GameLineup } from '@/types/game-operations';
import { formatPlayerLabel } from './player-label';

/**
 * 이벤트 행 왼쪽의 "전반 12:00" 뱃지 문구.
 *
 * 레거시 대회 결과에서 복원된 골(`@/lib/backfilled-goal-event` 참고)은 원본에 전/후반이
 * 없었고 분도 없을 수 있는데, `period`·`clockMs` 가 non-null 컬럼이라 각각 `1`·`0` 으로
 * 저장돼 있다 — 그대로 찍으면 이 화면이 "전반 0:00" 이라고 단정한다. 공개 화면은 서버가
 * 이미 이 값들을 `null` 로 내려 억제하는데, 운영 콘솔만 원시 행을 받아 거짓 주장을
 * 되살리고 있었다. 결과 정정(correction)을 판단하는 화면이라 오히려 더 정확해야 한다.
 */
function eventTimeLabel(event: GameEventRecord): string {
  if (!isBackfilledEvent(event.payload)) {
    return `${periodLabel(event.period)} ${formatMatchClock(event.clockMs)}`;
  }
  // 전/후반은 어느 경우든 모른다. 분은 남아 있으면 그대로 쓴다.
  return isBackfilledMinuteUnknown(event.payload) ? '시각 미상' : formatMatchClock(event.clockMs);
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
  events,
  sides,
  lineups,
  onAttachAssist,
  onReverseSubstitution,
}: {
  readonly events: readonly GameEventRecord[];
  /** 이 목록이 실제로 읽는 건 `id`·`displayNameSnapshot` 둘뿐이라 구조적
   * 최소 계약으로 받는다 — 결과 검토 화면이 넘기는
   * `TournamentGameDetail['sides']`(createdAt/updatedAt 없는 클라이언트
   * 미러)도 같은 렌더러를 그대로 쓸 수 있게 하기 위함이다. */
  readonly sides: ReadonlyArray<{ id: string; displayNameSnapshot: string }>;
  readonly lineups: readonly GameLineup[];
  readonly onAttachAssist?: (event: GameEventRecord) => void;
  /** 빠른 교체 모드의 오조작 복구 경로 — 되돌리기 버튼은 아직 되돌려지지
   * 않은 SUBSTITUTION 이벤트에만 뜬다. 새 되돌리기 API가 아니라 기존
   * `GamesService.reverseEvent`(CORRECTION) 를 그대로 호출한다. */
  readonly onReverseSubstitution?: (event: GameEventRecord) => void;
}) {
  if (events.length === 0) {
    return (
      <p className="px-1 py-3 text-xs text-[var(--text-muted)]">
        아직 기록된 이벤트가 없어요.
      </p>
    );
  }

  const sideName = new Map(sides.map((side) => [side.id, side.displayNameSnapshot]));
  const playerName = new Map(
    lineups.flatMap((lineup) =>
      lineup.participants.map((participant) => [
        participant.id,
        formatPlayerLabel(participant.jerseyNumber, participant.displayNameSnapshot),
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
            className="flex flex-col gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2"
          >
            {/* 좁은 폭에서는 위아래로 쌓는다. 한 줄로 두면 액션 묶음(어시스트·
                되돌리기·팀명)이 shrink-0 이라 폭을 먼저 가져가고, 남은 자리에서
                이벤트 문구가 잘려 "골 · 1 김..." 처럼 선수 이름이 사라졌다(알파
                390px 실측). 이 목록에서 가장 중요한 정보가 "누가 했는지"인데 그게
                제일 먼저 잘리는 셈이라, 폭이 부족하면 자르는 대신 줄을 나눈다.
                sm 이상은 한 줄에 다 들어가므로 기존 배치를 그대로 둔다. */}
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
              <div className="flex min-w-0 items-center gap-2">
                {/* clockMs 는 항상 정상이었다 — 표시만 분 단위(`m'`)로 뭉개서 같은 분에
                    찍힌 여러 이벤트를 구분할 수 없었다(실측 사고 사후조사에서 확인:
                    645886/649891/652602/655603ms 가 전부 "10'"로 보였다). 초까지 보여
                    구분 가능하게 한다 — ms 는 여기서는 산만하기만 하다(초 단위로 이미
                    충분히 구분되고, 커맨드 왕복 지연처럼 액션 가능한 값이 아니다). */}
                <span className="shrink-0 rounded bg-[var(--surface-soft)] px-1.5 py-0.5 text-xs font-medium tabular-nums text-[var(--text-muted)]">
                  {eventTimeLabel(event)}
                </span>
                <p className="truncate text-sm font-medium text-[var(--text-strong)]">
                  {eventTypeLabel(event)}
                  {event.type === 'SUBSTITUTION'
                    ? substitutionDetailSuffix(event, playerName)
                    : `${
                        event.participantId && playerName.has(event.participantId)
                          ? ` · ${playerName.get(event.participantId)}`
                          : ''
                      }${assistSuffix(event, playerName)}`}
                </p>
              </div>
              <div className="flex shrink-0 items-center justify-end gap-2">
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
                    className="flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-xs font-semibold text-[var(--blue700)] hover:bg-[var(--blue50)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
                  >
                    <Handshake size={12} aria-hidden="true" />
                    어시스트
                  </button>
                ) : null}
                {canReverseSubstitution ? (
                  <button
                    type="button"
                    onClick={() => onReverseSubstitution(event)}
                    className="flex min-h-[44px] items-center gap-1 rounded-lg border border-[var(--border)] px-2 text-xs font-semibold text-[var(--text-muted)] hover:bg-[var(--surface-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
                  >
                    <Undo2 size={12} aria-hidden="true" />
                    되돌리기
                  </button>
                ) : null}
                {/* 팀 귀속은 기록자가 매 행에서 즉시 확인해야 하는 정보인데, 행에서
                    가장 약하게 표현돼 있었다(11px·regular·muted, 우측 끝 — 알파 390px
                    실측). 색을 더 쓰지 않고(R-C1) 굵기로만 대비를 올린다 — 색으로
                    팀을 구분하면 색만으로 의미를 전달하게 돼 R-C3 에 걸린다. */}
                <span className="text-xs font-medium text-[var(--text-muted)]">
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

/** "(도움 10 김철수)" — 골에 기록된 도움 선수. 결과 검토자가 승인/반려의
 * 근거로 확인해야 하는 정보라 목록에 함께 보여준다. 라인업 스냅샷에 없는
 * 참가자는 이름을 지어내지 않고 생략한다(득점자와 같은 규칙). */
function assistSuffix(event: GameEventRecord, playerName: Map<string, string>): string {
  if (event.type !== 'GOAL' || event.assistParticipantId === null) return '';
  const name = playerName.get(event.assistParticipantId);
  return name === undefined ? '' : ` (도움 ${name})`;
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
