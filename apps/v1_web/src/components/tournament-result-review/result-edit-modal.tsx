'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type {
  GameResultParticipantInput,
  GameResultParticipantRecord,
  GameResultScore,
  GameResultScoreInput,
  TournamentGameSide,
} from '@/hooks/use-tournament-result-review';
import type { GameLineup } from '@/types/game-operations';
import { formatGameResultScoreWithPenalties, readGameResultScore } from '@/lib/game-result-score';

/**
 * `score` 는 서버가 돌려주는 스냅샷(`GameResultScore`, 두 형태의 union -- `base.score`가
 * 이 형태다)이 **아니라** 항상 `GameResultScoreInput`(평평한 `{home, away, penalties?}`)
 * 이어야 한다. `CreateGameResultCorrectionDto`/`SupersedeAndSubmitGameResultRevisionDto`의
 * `GameScoreDto`가 `whitelist: true, forbidNonWhitelisted: true` 아래서 `home`/`away`/
 * `penalties?` 만 받기 때문 -- `base.score`를 그대로(또는 spread해서) 보내면
 * `goals`/`penalty`/`incomplete`/`provenance`/`regulation` 같은 여분 필드가 섞여
 * `400 VALIDATION_ERROR`가 난다(알파 실측). 반대로 `penalties`는 여분 필드가 아니라
 * **허용 필드**이므로 서버가 받아 주는 상태에서는 반드시 실어 보낸다(아래
 * `penaltiesAllowed`/`readSubmittablePenalties` 참고). `base.score`가 union
 * 타입인 채로 이 타입을 좁혀 두면, `onConfirm` 구현부가 실수로 스냅샷을 그대로(또는
 * spread해서) 넘기는 순간 컴파일이 깨진다 -- union의 중첩 분기(`regulation` 형태)는
 * `home`/`away`가 아예 없어서 `GameResultScoreInput`에 대입할 수 없기 때문이다.
 * 이전에는 `GameResultScore`가(잘못) 항상 평평한 형태로만 선언돼 있어서 두 방향이
 * 사실상 같은 타입을 공유했고, 그래서 틀린 채로 컴파일을 통과했다.
 */
export type ResultEditSubmitInput = {
  score: GameResultScoreInput;
  actualParticipants: GameResultParticipantInput[];
  mvpParticipantId?: string;
  reason: string;
};

export type ResultEditModalProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  reasonLabel?: string;
  base: {
    score: GameResultScore;
    participants: readonly GameResultParticipantRecord[];
    mvpParticipantId: string | null;
  };
  sides: readonly TournamentGameSide[];
  /** `GET /games/:gameId/lineups`(`GamesService.listLineups()`)의 라인업 스냅샷 --
   * 실명 표시에 쓴다. 아직 로딩 중이거나 없으면 빈 배열을 넘기면 된다(폴백은
   * `participantLabel`이 알아서 처리한다). */
  lineups: readonly GameLineup[];
  /**
   * 이 경기가 결선(knockout) 픽스처인지 -- `GET /games/:gameId` 응답의
   * `isKnockoutFixture`(`TournamentGameDetail`)를 그대로 내려준다.
   *
   * **기본값을 두지 않는다(필수 prop).** 이 값은 경고 문구만 고르는 게 아니라
   * `penalties`를 제출에 실을지 말지를 가르는 판정에 들어간다(아래 `penaltiesAllowed`
   * 참고) -- `false`로 기본값을 주면 이 prop을 빠뜨린 호출부가 결선 경기의 승부차기
   * 결과를 **조용히 떨어뜨린다**. 빠뜨림이 컴파일 에러로 드러나야 한다.
   */
  isKnockoutFixture: boolean;
  submitting?: boolean;
  errorMessage?: string | null;
  onConfirm: (input: ResultEditSubmitInput) => void;
  onCancel: () => void;
};

type EditableParticipant = GameResultParticipantInput;

function sideLabel(sides: readonly TournamentGameSide[], sideId: string): string {
  const side = sides.find((candidate) => candidate.id === sideId);
  if (!side) return sideId.slice(-6);
  return side.sideKey === 'HOME' ? '홈' : '원정';
}

/**
 * 참가자 id -> "#등번호 이름" 표시 문자열 맵.
 *
 * `GET /games/:gameId/lineups`(라우트는 `apps/v1_api/src/games/games.controller.ts`의
 * `lineups()` -- Task 14가 찾던 별도 `games/lineups` 디렉터리가 아니라
 * `games.controller.ts` 안에 이미 있다)가 돌려주는 각 라인업의 `participants[].id`는
 * 결과 기록 쪽 `GameResultParticipantRecord.participantId`와 같은 값을 가리킨다 --
 * `GamesService`가 결과 참가자 행을 만들 때 `participantId: participant.id`로
 * `V1GameParticipant.id`를 그대로 복사해서 저장하기 때문(`games.service.ts`의
 * `submitResult`류 메서드 참고). 운영 콘솔의 `recorded-event-list.tsx`가 같은
 * 라인업 응답으로 `playerName` 맵을 만드는 것과 동일한 관례를 따른다.
 */
function buildParticipantNameMap(lineups: readonly GameLineup[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const lineup of lineups) {
    for (const participant of lineup.participants) {
      const jersey = participant.jerseyNumber !== null ? `#${participant.jerseyNumber} ` : '';
      map.set(participant.id, `${jersey}${participant.displayNameSnapshot}`);
    }
  }
  return map;
}

/** 라인업에 없는 참가자(팀 이탈 등으로 로스터에서 빠졌거나, 아직 라인업 응답이
 * 로딩 중인 경우)는 이름을 지어내지 않고 기존 폴백(사이드 + id 뒷자리)을 쓰되,
 * 폴백임이 드러나도록 안내 문구를 덧붙인다 -- 조용히 빈칸으로 두지 않는다. */
function participantLabel(
  sides: readonly TournamentGameSide[],
  nameMap: ReadonlyMap<string, string>,
  participantId: string,
  sideId: string,
): string {
  const name = nameMap.get(participantId);
  if (name) return `${sideLabel(sides, sideId)} · ${name}`;
  return `${sideLabel(sides, sideId)} · 참가자 ${participantId.slice(-6)} (라인업에 없음)`;
}

/**
 * 이미 남아 있는 기록을 **한 필드도 빠뜨리지 않고** 편집 상태로 옮긴다.
 *
 * 정정/재제출은 참가자 기록 전체를 다시 실어 보내는 계약이고, 서버
 * (`tournament-result-review.service.ts`)는 미전달 필드를 `assists ?? 0`/`fouls ?? 0`
 * 으로 채운다 -- 즉 여기서 필드를 빠뜨리면 점수만 고치는 정정 한 번에 선수 개개인의
 * 어시스트·파울이 0으로 초기화된다(실제 사용자 보고 결함). `EditableParticipant`가
 * 공용 계약(`V1GameResultParticipantInput`)의 alias 이므로, 계약에 필드가 늘면 이
 * 함수가 컴파일 에러로 먼저 걸린다.
 */
function toEditable(record: GameResultParticipantRecord): EditableParticipant {
  return {
    participantId: record.participantId,
    sideId: record.sideId,
    started: record.started,
    minutesPlayed: record.minutesPlayed ?? undefined,
    goals: record.goals,
    assists: record.assists,
    fouls: record.fouls,
    cards: { ...record.cards },
    goalkeeper: record.goalkeeper,
  };
}

/**
 * base 스냅샷의 승부차기 점수를 **제출해도 되는 형태로 다시 만든다** -- 못 쓰는 값이면
 * `null`(= 싣지 않는다).
 *
 * 왜 런타임 검사가 필요한가: `V1GameResultRevision.score` 는 느슨한 JSON 컬럼이고,
 * `readGameResultScore`(`lib/game-result-score.ts`)는 그 안의 `penalty`/`penalties` 를
 * **타입 주장만 하고 검증하지 않는다**(레거시 백필이 쓴 값이 그대로 나온다). 서버도
 * 이 값을 검증하지 못한다 -- `GameScoreDto.penalties` 는 `@IsObject()` 하나뿐이고
 * (`apps/v1_api/src/games/dto/game-result.dto.ts`) 전역 `whitelist` 는 중첩 객체 안까지
 * 파고들지 않는다. 즉 여기서 걸러 내지 않으면 레거시 쓰레기 값(동점 승부차기, 정수 아닌
 * 값, 여분 키)이 **새 권위 리비전에 그대로 박제**된다.
 *
 * 판정 기준은 서버 `extractEndPenalties`(`games.service.ts`)와 같다 -- 0 이상 정수 +
 * 승자가 갈릴 것. 통과한 값도 **다시 만들어서** 돌려준다(원본 객체를 그대로 넘기지
 * 않는다): 느슨한 JSON 에 딸려 온 여분 키를 여기서 떨어뜨리는 게 이 함수의 두 번째 일이다.
 *
 * 그래서 **허용 키 목록을 여기서 빠뜨리면 그 값은 조용히 사라진다.** 선축
 * (`firstKickSideKey`)이 정확히 그 자리다 -- 서버 `PenaltyScoreDto` 가 받아 주는 허용
 * 키이므로 재조립에 포함해야 한다. 빠뜨리면 승부차기로 승자가 갈린 결선 경기를 한 번만
 * 정정해도 "누가 먼저 찼는지"가 영구히 사라진다(이 폼에는 선축 입력란이 없어 되살릴
 * 수단도 없다). 값이 'HOME'/'AWAY' 가 아니면 선축만 떨어뜨리고 점수는 살린다 -- 서버
 * `readStoredPenalties` 와 같은 관용 기준이다(여기서 점수까지 버리면 결선 정정이 통째로
 * 막힌다).
 */
function readSubmittablePenalties(raw: unknown): GameResultScoreInput['penalties'] | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const { home, away, firstKickSideKey, takenHome, takenAway, operatorOverride } = raw as {
    home?: unknown;
    away?: unknown;
    firstKickSideKey?: unknown;
    takenHome?: unknown;
    takenAway?: unknown;
    operatorOverride?: unknown;
  };
  if (typeof home !== 'number' || !Number.isInteger(home) || home < 0) return null;
  if (typeof away !== 'number' || !Number.isInteger(away) || away < 0) return null;
  // 동점 승부차기는 승자를 못 가리므로 서버가 422 `TOURNAMENT_PENALTY_INVALID` 로 막는다.
  if (home === away) return null;
  const side: { firstKickSideKey?: 'HOME' | 'AWAY' } =
    firstKickSideKey === 'HOME' || firstKickSideKey === 'AWAY' ? { firstKickSideKey } : {};
  // 킥 수와 우회 표식도 **함께 옮긴다.** 이 화면에는 승부차기 입력란이 아예 없어서
  // (2026-08-18 실측: 폼 필드 186개 중 0개) 여기서 떨어뜨리면 운영자가 되살릴 수단이 없고,
  // 정정 한 번에 "이 결과는 규칙과 다르게 닫혔다"는 감사 기록이 영구히 사라진다.
  // 킥 수는 둘 다 유효할 때만 옮긴다 — 한쪽만 옮기면 어느 팀이 몇 번 찼는지 모르는 채로
  // 서버 판정이 돌아간다.
  const countsValid =
    typeof takenHome === 'number' &&
    Number.isInteger(takenHome) &&
    takenHome >= home &&
    typeof takenAway === 'number' &&
    Number.isInteger(takenAway) &&
    takenAway >= away;
  const counts = countsValid ? { takenHome, takenAway } : {};
  const override = operatorOverride === true ? { operatorOverride: true } : {};
  return { home, away, ...side, ...counts, ...override };
}

/** 숫자 입력 정규화 -- 서버 `GameScoreDto`/`GameResultParticipantDto` 의 숫자 필드는
 * 전부 `@IsInt() @Min(0)` 이라 소수를 그대로 보내면 `400 VALIDATION_ERROR` 가 나고, 그
 * 코드는 `KNOWN_ERROR_MESSAGES` 에 없어서 검증 원문이 그대로 모달에 뜬다.
 * `<input type="number">` 는 `1.5` 를 그대로 넘겨주므로 여기서 정수로 자른다. */
function toStatValue(rawValue: string): number {
  return Math.max(0, Math.trunc(Number(rawValue) || 0));
}

/**
 * 참가자별 기록 숫자 입력 한 칸. 다섯 칸(득점·어시스트·파울·경고·퇴장)이 같은 마크업을
 * 쓰도록 한 곳에 모았다 -- 새 칸을 붙일 때 라벨 연결이나 터치 타겟을 빠뜨릴 여지를
 * 없앤다. `<label htmlFor>` + `<input id>` 명시 연결(프로젝트 폼 규칙)이고, 터치 타겟은
 * 44px 다(기존에 이 칸들이 40px 로 규칙에 미달해 있었다 -- 같은 마크업을 건드리는
 * 이번 변경에서 함께 맞춘다).
 */
function StatNumberField({
  id,
  label,
  value,
  onValueChange,
}: {
  id: string;
  label: string;
  value: number;
  onValueChange: (next: number) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <label htmlFor={id} className="tm-text-caption">
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={0}
        inputMode="numeric"
        className="tm-input"
        style={{ width: 56, minHeight: 44 }}
        value={value}
        onChange={(event) => onValueChange(toStatValue(event.target.value))}
      />
    </div>
  );
}

/**
 * ResultEditModal -- shared score + per-participant stat + MVP + reason form
 * for both `POST /games/:gameId/corrections` (correction) and
 * `POST .../supersede-and-submit` (resubmission after reject/
 * supplement_requested). Pre-populated from the base revision being
 * corrected/resubmitted so the operator edits an existing, known-good
 * participant set rather than assembling one from scratch -- adding/removing
 * roster members is out of scope for this pass (it needs a full roster
 * listing endpoint this lane does not own; see the implementation report).
 *
 * Always shows a before -> after diff summary for the score and any changed
 * participant stat before the confirm button is enabled, satisfying "every
 * correction always captures reason and diff".
 */
export function ResultEditModal({
  open,
  title,
  message,
  confirmLabel,
  reasonLabel = '사유',
  base,
  sides,
  lineups,
  isKnockoutFixture = false,
  submitting = false,
  errorMessage,
  onConfirm,
  onCancel,
}: ResultEditModalProps) {
  const idPrefix = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<Element | null>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  // Lazy initial state seeded from `base` exactly once at mount. This modal
  // is always conditionally rendered by its callers (`{correctionFormOpen &&
  // currentOfficial ? <ResultEditModal .../> : null}` /
  // `{resubmitTarget ? <ResultEditModal .../> : null}`), so a fresh instance
  // -- and therefore a fresh `useState` seed -- is created every time it
  // opens. Resetting these fields from an effect keyed on the `base` PROP
  // (rather than only at mount) would be actively wrong here: `base` is a new
  // object literal on every parent re-render (e.g. while a mutation's
  // `isPending` flips true/false during submit), so such an effect would
  // silently discard in-progress edits on any unrelated parent re-render
  // while this modal stays mounted.
  // `base.score`는 두 형태의 union이다(백필된 경기는 중첩 `{regulation:{…}}` 형태) --
  // `.home`/`.away`를 직접 읽으면 그 경로에서 `undefined`가 되어 폼이 빈 채로 뜬다
  // (알파 실측 사고). `readGameResultScore`로 정규화하고, 기록된 점수가 없으면(레거시
  // `regulation: null`) 폼의 편집 시작값으로 0을 쓴다 -- 이건 "기록 없음"을 사실인 척
  // 보여주는 게 아니라(그런 표시는 아래 diff 문구가 쓰는
  // `formatGameResultScoreWithPenalties`의 "기록 없음" 폴백이 담당한다) 값을 입력받아야
  // 하는 숫자 입력란의 편집 시작값일 뿐이다.
  const [home, setHome] = useState(readGameResultScore(base.score)?.home ?? 0);
  const [away, setAway] = useState(readGameResultScore(base.score)?.away ?? 0);
  const [participants, setParticipants] = useState<EditableParticipant[]>(() =>
    base.participants.map(toEditable),
  );
  const [mvpParticipantId, setMvpParticipantId] = useState<string>(base.mvpParticipantId ?? '');
  const [reason, setReason] = useState('');

  useEffect(() => {
    previousFocusRef.current = document.activeElement;
    const id = setTimeout(() => {
      // Guard against clobbering focus the user (or the focus trap) has
      // already moved into the dialog by the time this fires -- e.g. typing
      // straight into the reason textarea right after the dialog opens.
      // Without this check, this unconditional `.focus()` steals focus back
      // to the home-score input mid-keystroke, silently dropping the tail of
      // whatever the user was typing elsewhere in the form.
      if (dialogRef.current?.contains(document.activeElement)) return;
      firstFieldRef.current?.focus();
    }, 60);
    return () => {
      clearTimeout(id);
      // Restore focus on unmount (WCAG 2.4.3) -- this component is always
      // conditionally rendered by its caller (see the state-initialization
      // comment above), so unmount IS the "closed" transition; there is no
      // separate `open:true->false` prop toggle to key this off of.
      const el = previousFocusRef.current;
      if (el && typeof (el as HTMLElement).focus === 'function') (el as HTMLElement).focus();
    };
    // Mount-only: see the state-initialization comment above for why this
    // must not re-run when `base` changes identity on an unrelated re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onCancel]);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const FOCUSABLE =
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', trap);
    return () => document.removeEventListener('keydown', trap);
  }, [open]);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const participantNameMap = useMemo(() => buildParticipantNameMap(lineups), [lineups]);

  const trimmedReason = reason.trim();
  const baseScore = readGameResultScore(base.score);
  // 승부차기 점수는 이 폼에서 편집하지 않고 base 스냅샷에서 읽어 **서버가 받아 주는
  // 상태일 때만** 이어서 보낸다(`readGameResultScore` 가 중첩 `penalty`(단수)까지
  // `penalties`(복수)로 정규화해 돌려주므로 형태별 분기는 여기서 필요 없다). 편집
  // 대상이 아니라서 state 로 두지 않는다 -- 정규시간 점수만 고치는 정정이 결선 경기의
  // 승자(승부차기)를 조용히 지우지 않게 보존하는 것이 목적이다. 승부차기 자체를 폼에서
  // 고치는 입력란은 아직 이 폼의 범위가 아니므로, 이어서 보낼 수 없는 상태에서는 값을
  // 떨어뜨리고 그 사실을 경고로 드러낸다(아래 `penaltyWarning`).
  const rawPenalties: unknown = baseScore?.penalties;
  const submittablePenalties = readSubmittablePenalties(rawPenalties);
  /**
   * 서버가 `penalties` 를 **받아 주는 상태인가**. 판정을 서버 `applyPenalties`
   * (`games.service.ts`)와 1:1로 맞춘다 -- 그쪽은 두 방향 모두 하드 거부한다:
   *
   *  - 결선 픽스처가 아니면        -> 409 `TOURNAMENT_PENALTY_NOT_ALLOWED`
   *    ('...can only be recorded for knockout-phase fixtures')
   *  - 정규시간이 무승부가 아니면  -> 409 `TOURNAMENT_PENALTY_NOT_ALLOWED`
   *    ('...only recorded when regulation time ends level')
   *
   * 그래서 그 두 경우에는 base 에 승부차기 값이 있어도 **싣지 않는다**. 무조건 통과시키면
   * (a) 서버 가드가 배포된 뒤에는 결선 경기의 정규시간 점수 정정이 아예 불가능해지고
   * (폼에 승부차기 입력란이 없어 값을 지울 수단이 없다), (b) 그 전에는
   * `{home:1, away:2, penalties:{4,3}}` 처럼 **서로 모순된 공식 스코어**가 저장된다 --
   * 브래킷 진출자는 정규시간 우선으로 AWAY 를 올리는데
   * (`game-result-bracket-projection.service.ts` 의 `resolveWinnerSide`) 공개 화면은
   * `hasPenalty` 우선이라 HOME 을 승자·우승팀으로 그린다
   * (`tournaments/[id]/results/results-page-client.tsx`, `tournament-detail-client.tsx`,
   * `awards/awards-page-client.tsx` 의 `getWinnerSide`). 결승이면 공개 우승팀이 실제
   * 진출팀과 달라진다.
   */
  const penaltiesAllowed = isKnockoutFixture && home === away;
  /**
   * 제출용 스코어. **직접 리터럴로만 조립한다 -- 절대 스냅샷을 spread 하지 않는다.**
   * `GameResultScoreInput` 로 타입을 박아 뒀지만 그 초과 프로퍼티 검사(excess property
   * check)는 *직접 리터럴에만* 걸린다 -- `{ ...base.score, home, away }` 형태는 여분 키가
   * 섞여도 `tsc` 가 통과시킨다(이 worktree 에서 실측 확인). 알파에서 `goals`/`penalty`/
   * `regulation`/`incomplete`/`provenance` 가 딸려가 `400 VALIDATION_ERROR` 가 났던 사고가
   * 정확히 그 경로다. 허용 키는 서버 `GameScoreDto` 의 `home`/`away`/`penalties?` 3키뿐이고,
   * 그 목록의 단일 소스는 `V1GameResultScoreInput`(`types/api.ts`)이다.
   */
  const draftScore: GameResultScoreInput =
    penaltiesAllowed && submittablePenalties
      ? { home, away, penalties: submittablePenalties }
      : { home, away };
  const penaltiesDropped = rawPenalties !== undefined && draftScore.penalties === undefined;
  const scoreChanged =
    home !== (baseScore?.home ?? 0) ||
    away !== (baseScore?.away ?? 0) ||
    // 승부차기가 떨어져 나가는 것도 "점수 변경"이다 -- 정규시간 점수를 안 건드린 정정에서
    // 승부차기만 사라지는 경우(결선이 아닌 픽스처의 레거시 승부차기 등)에 diff 가 침묵하면
    // 운영자가 무엇을 잃는지 확정 직전에 확인할 수 없다.
    penaltiesDropped;
  /**
   * 승부차기 정합성을 저장 **전에** 알려준다. 서버 가드에 걸려 저장이 튕기거나, 기존
   * 승부차기 기록이 함께 지워지는 상황을 저장 버튼을 누르기 전에 드러낸다.
   *
   * 네 경우는 서로 배타적이라 경고 영역에는 항상 최대 한 문구만 들어간다.
   *
   * 안내 문구에 "무효화 후 재입력"을 해결책으로 적지 않는다 -- 무효화는 다음 라운드
   * 픽스처가 이미 `scheduled` 를 벗어났으면 409 `NEXT_FIXTURE_CONFLICT` 로 막히므로
   * (`tournament-result-review.service.ts`) 그 경우 안내대로 해도 두 번 실패한다.
   * 승부차기 자체를 폼에서 입력·수정하는 입력란은 이 pass 의 범위가 아니다.
   */
  const penaltyWarning = penaltiesAllowed
    ? submittablePenalties
      ? null
      : rawPenalties !== undefined
        ? '기존 승부차기 기록을 그대로 이어서 저장할 수 없어요(양 팀 점수가 0 이상의 정수이고 승자가 갈려야 해요). 결선 경기는 정규시간 무승부로 확정할 수 없으니 승부차기 결과를 다시 기록해야 해요.'
        : '결선 경기는 정규시간 무승부로 확정할 수 없어요. 승부차기 결과가 필요하니 점수를 다시 확인해 주세요.'
    : penaltiesDropped
      ? isKnockoutFixture
        ? '정규시간 승패가 갈렸으니 기존 승부차기 결과는 함께 지워져요. 승부차기 결과가 남아야 한다면 정규시간 점수를 다시 확인해 주세요.'
        : '이 경기는 결선이 아니라 승부차기를 기록할 수 없어요. 저장하면 기존 승부차기 결과는 함께 지워져요.'
      : null;
  const warningId = `${idPrefix}-knockout-penalty`;
  const participantDiffs = useMemo(
    () =>
      participants.filter((participant, index) => {
        const original = base.participants[index];
        if (!original) return true;
        return (
          participant.goals !== original.goals ||
          // 어시스트·파울도 diff 대상이다 -- 폼에서 고칠 수 있는 값이 diff 에서 빠지면
          // 운영자가 확정 직전에 자기가 무엇을 바꾸는지 확인할 수 없다.
          participant.assists !== original.assists ||
          participant.fouls !== original.fouls ||
          participant.cards.yellow !== original.cards.yellow ||
          participant.cards.red !== original.cards.red ||
          participant.started !== original.started ||
          participant.goalkeeper !== original.goalkeeper ||
          (participant.minutesPlayed ?? null) !== (original.minutesPlayed ?? null)
        );
      }),
    [participants, base.participants],
  );
  const canSubmit = trimmedReason.length > 0 && !submitting;

  function updateParticipant(index: number, patch: Partial<EditableParticipant>) {
    setParticipants((current) =>
      current.map((participant, i) => (i === index ? { ...participant, ...patch } : participant)),
    );
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4"
      style={{ background: 'rgba(25,31,40,0.45)' }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${idPrefix}-title`}
        aria-describedby={`${idPrefix}-message`}
        className="w-full max-w-[560px] rounded-2xl overflow-hidden"
        style={{
          background: 'var(--surface, #fff)',
          boxShadow: '0 8px 32px rgba(20,28,45,0.14)',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ padding: '24px 24px 0', flexShrink: 0 }}>
          <p id={`${idPrefix}-title`} className="tm-text-body-lg" style={{ color: 'var(--text-strong)', fontWeight: 700, marginBottom: 8 }}>
            {title}
          </p>
          <p id={`${idPrefix}-message`} className="tm-text-label" style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>
            {message}
          </p>
        </div>

        <div style={{ padding: '16px 24px', overflowY: 'auto', flex: 1 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 20 }}>
            <div style={{ flex: 1 }}>
              <label htmlFor={`${idPrefix}-home`} className="tm-text-label" style={{ display: 'block', marginBottom: 6 }}>
                홈 점수
              </label>
              <input
                ref={firstFieldRef}
                id={`${idPrefix}-home`}
                type="number"
                inputMode="numeric"
                min={0}
                className="tm-input"
                style={{ width: '100%', minHeight: 44 }}
                aria-describedby={penaltyWarning ? warningId : undefined}
                value={home}
                onChange={(event) => setHome(toStatValue(event.target.value))}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label htmlFor={`${idPrefix}-away`} className="tm-text-label" style={{ display: 'block', marginBottom: 6 }}>
                원정 점수
              </label>
              <input
                id={`${idPrefix}-away`}
                type="number"
                inputMode="numeric"
                min={0}
                className="tm-input"
                style={{ width: '100%', minHeight: 44 }}
                aria-describedby={penaltyWarning ? warningId : undefined}
                value={away}
                onChange={(event) => setAway(toStatValue(event.target.value))}
              />
            </div>
          </div>

          {/* 경고일 뿐 차단이 아니다 -- 무효화된 결과의 재입력(VOID 재진입)은 정정과
              다른 계약이라 프론트가 무승부를 이유로 제출 자체를 막아서는 안 된다.
              그래서 이 블록은 `canSubmit` 에 관여하지 않는다.

              라이브 영역은 **문구와 함께 마운트되지 않고 항상 DOM 에 있어야** 한다 --
              다수의 스크린리더는 이미 존재하던 `role="status"` 영역의 *내용 변경*만
              읽어 주고, 내용과 함께 새로 삽입된 노드는 읽지 않는다. 조건부 마운트로
              두면 점수를 무승부로 바꾸는 순간의 경고를 시각장애 운영자가 듣지 못하고
              서버 409 로만 알게 된다(= 이 기능이 없애려던 바로 그 UX). 그래서 빈 문구일
              때도 노드를 남기고 텍스트만 토글한다. */}
          <p
            id={warningId}
            role="status"
            aria-live="polite"
            className="tm-text-caption"
            style={{ color: 'var(--orange700)', marginBottom: penaltyWarning ? 16 : 0 }}
          >
            {penaltyWarning ?? ''}
          </p>

          {scoreChanged ? (
            <p className="tm-text-caption" style={{ color: 'var(--blue700)', marginBottom: 16 }}>
              {/* 승부차기까지 넣어 읽어준다 -- 결선 무승부는 승부차기로만 승자가 갈리므로
                  정규시간 점수만 보여주면 diff 에서 정작 승자를 가른 값이 빠진다
                  (`lib/game-result-score.ts` 의 "보여주는 자리" 규약). */}
              점수 변경: {formatGameResultScoreWithPenalties(base.score)} →{' '}
              {formatGameResultScoreWithPenalties(draftScore)}
            </p>
          ) : null}

          <p className="tm-text-label" style={{ fontWeight: 600, color: 'var(--text-strong)', marginBottom: 8 }}>
            참가자별 기록
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
            {participants.map((participant, index) => (
              <div key={participant.participantId} className="tm-card" style={{ padding: 12 }}>
                <p className="tm-text-caption" style={{ fontWeight: 600, marginBottom: 8 }}>
                  {participantLabel(sides, participantNameMap, participant.participantId, participant.sideId)}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                  <StatNumberField
                    id={`${idPrefix}-p${index}-goals`}
                    label="득점"
                    value={participant.goals}
                    onValueChange={(goals) => updateParticipant(index, { goals })}
                  />
                  {/* 어시스트·파울은 서버 `GameResultParticipantDto` 가 이미 받는 필드인데
                      이 폼에 입력란이 없어서, 확정 후 값을 고칠 유일한 통로(정정)가
                      오히려 값을 0으로 지우고 있었다. */}
                  <StatNumberField
                    id={`${idPrefix}-p${index}-assists`}
                    label="어시스트"
                    value={participant.assists}
                    onValueChange={(assists) => updateParticipant(index, { assists })}
                  />
                  <StatNumberField
                    id={`${idPrefix}-p${index}-fouls`}
                    label="파울"
                    value={participant.fouls}
                    onValueChange={(fouls) => updateParticipant(index, { fouls })}
                  />
                  <StatNumberField
                    id={`${idPrefix}-p${index}-yellow`}
                    label="경고"
                    value={participant.cards.yellow}
                    onValueChange={(yellow) =>
                      updateParticipant(index, { cards: { ...participant.cards, yellow } })
                    }
                  />
                  <StatNumberField
                    id={`${idPrefix}-p${index}-red`}
                    label="퇴장"
                    value={participant.cards.red}
                    onValueChange={(red) => updateParticipant(index, { cards: { ...participant.cards, red } })}
                  />
                  <label className="tm-text-caption" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input
                      type="checkbox"
                      checked={participant.started}
                      onChange={(event) => updateParticipant(index, { started: event.target.checked })}
                    />
                    선발
                  </label>
                  <label className="tm-text-caption" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input
                      type="checkbox"
                      checked={participant.goalkeeper}
                      onChange={(event) => updateParticipant(index, { goalkeeper: event.target.checked })}
                    />
                    골키퍼
                  </label>
                </div>
              </div>
            ))}
          </div>

          {participantDiffs.length > 0 ? (
            <p className="tm-text-caption" style={{ color: 'var(--blue700)', marginBottom: 16 }}>
              참가자 기록 변경: {participantDiffs.length}명
            </p>
          ) : null}

          <div style={{ marginBottom: 20 }}>
            <label htmlFor={`${idPrefix}-mvp`} className="tm-text-label" style={{ display: 'block', marginBottom: 6 }}>
              MVP (선택)
            </label>
            <select
              id={`${idPrefix}-mvp`}
              className="tm-input"
              style={{ width: '100%', minHeight: 44 }}
              value={mvpParticipantId}
              onChange={(event) => setMvpParticipantId(event.target.value)}
            >
              <option value="">선정 안 함</option>
              {participants.map((participant) => (
                <option key={participant.participantId} value={participant.participantId}>
                  {participantLabel(sides, participantNameMap, participant.participantId, participant.sideId)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor={`${idPrefix}-reason`} className="tm-text-label" style={{ display: 'block', marginBottom: 6 }}>
              {reasonLabel}
            </label>
            <textarea
              id={`${idPrefix}-reason`}
              rows={3}
              className="tm-input"
              style={{ width: '100%', resize: 'vertical', minHeight: 72 }}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="사유를 입력해 주세요"
            />
          </div>

          {errorMessage ? (
            <p role="alert" className="tm-text-caption" style={{ color: 'var(--red700)', marginTop: 12 }}>
              {errorMessage}
            </p>
          ) : null}
        </div>

        <div style={{ display: 'flex', gap: 8, padding: '16px 24px 24px', flexShrink: 0 }}>
          <button
            type="button"
            className="tm-btn tm-btn-md tm-btn-neutral"
            style={{ flex: 1, minHeight: 44 }}
            onClick={onCancel}
            disabled={submitting}
          >
            취소
          </button>
          <button
            type="button"
            className="tm-btn tm-btn-md tm-btn-primary"
            style={{ flex: 1, minHeight: 44 }}
            disabled={!canSubmit}
            aria-busy={submitting ? 'true' : undefined}
            onClick={() => {
              if (!canSubmit) return;
              onConfirm({
                // `draftScore`는 허용 키(`home`/`away`/`penalties?`)만 담은 직접 리터럴이다
                // (조립부 주석 참고). `base.score`(서버 스냅샷)를 그대로 넘기거나 spread하면
                // `goals`/`penalty`/`incomplete`/`provenance`/`regulation` 같은 여분 필드가
                // 함께 딸려가 서버 `GameScoreDto`의 `forbidNonWhitelisted`에 걸려
                // `400 VALIDATION_ERROR`가 난다(알파 실측). 단 `penalties`는 여분 필드가
                // 아니라 **허용 필드**다 -- 결선 무승부는 승부차기로만 승자가 갈리므로,
                // 서버가 받아 주는 상태(`penaltiesAllowed`)에서는 반드시 실어 보낸다.
                score: draftScore,
                actualParticipants: participants,
                ...(mvpParticipantId ? { mvpParticipantId } : {}),
                reason: trimmedReason,
              });
            }}
          >
            {submitting ? '처리 중…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
