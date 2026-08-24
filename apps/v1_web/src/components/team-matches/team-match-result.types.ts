import { randomUuid } from '@/lib/uuid';
import type {
  V1GameResultRevision,
  V1GameResultRevisionState,
  V1TeamMatchLineupBenchEntry,
  V1TeamMatchLineupStarter,
} from '@/types/api';

/** 득점 이벤트 한 건 — participantId가 null이면 "익명"(선수를 특정하지 않고 기록). */
export type GoalDraft = { key: string; participantId: string | null };
/** 카드 이벤트 한 건. participantId가 ''이면 아직 선수를 고르지 않은 상태(제출 차단 대상). */
export type CardDraft = { key: string; participantId: string; type: 'yellow' | 'red' };

/** One roster row the host can attribute goals/cards to on the result form. */
export type ResultRosterRow = {
  participantId: string;
  displayName: string;
  jerseyNumber: number | null;
  goalkeeper: boolean;
  started: boolean;
};

export function toResultRosterRows(
  starters: V1TeamMatchLineupStarter[],
  bench: V1TeamMatchLineupBenchEntry[],
): ResultRosterRow[] {
  return [
    ...starters.map((starter) => ({
      participantId: starter.id,
      displayName: starter.displayName,
      jerseyNumber: starter.jerseyNumber,
      goalkeeper: starter.goalkeeper,
      started: true,
    })),
    ...bench.map((entry) => ({
      participantId: entry.id,
      displayName: entry.displayName,
      jerseyNumber: entry.jerseyNumber,
      goalkeeper: false,
      started: false,
    })),
  ];
}

/**
 * `eventsHash` is a required, non-empty string on `CreateGameResultRevisionDto` but the
 * server never cross-checks it against anything for a team match (there is no event
 * stream to hash — see docs/api/domains/games.md's Task 17 note). We still compute a
 * real content hash of what the host actually submitted, both so the field is honest
 * (not a magic constant) and so a resubmission of literally identical content is
 * naturally idempotent-detectable later if a future task wires that check up.
 *
 * Deliberately synchronous and dependency-free (FNV-1a, 32-bit) rather than
 * `crypto.subtle.digest` — jsdom's `Crypto` does not implement `SubtleCrypto` the way
 * some legacy WebViews (see `lib/uuid.ts`'s randomUUID fallback note) don't either, and
 * this value is never verified server-side, so a lightweight fingerprint is enough.
 */
/**
 * 결과 리비전 `reason` 의 표시용 정리 — 맨 앞의 내부 마커(`[LEAGUE_RESULT_ENTRY]` 등)를
 * 벗겨낸다.
 *
 * 마커는 서버(league-match-result-entry.service.ts)가 **멱등 판정**(startsWith)에 쓰는
 * 저장용 값이라 저장 자체에서 뺄 수 없다. 그런데 화면이 reason 을 그대로 렌더하면서
 * 사용자에게 "[LEAGUE_RESULT_CORRECTION] 스코어 정정" 처럼 내부 식별자가 노출됐다
 * (2026-08-25 alpha 실측에서 발견). 형태가 같은 미래의 마커까지 잡도록 특정 문자열이
 * 아니라 패턴([대문자·숫자·언더스코어])으로 벗긴다 — 사용자가 직접 대괄호로 시작하는
 * 사유를 쓰는 경우와 충돌하지 않게 대문자 마커 형태로만 한정한다.
 */
export function displayRevisionReason(reason: string | null | undefined): string {
  if (!reason) return '';
  return reason.replace(/^\[[A-Z0-9_]+\]\s*/, '').trim();
}

export function hashResultPayload(payload: unknown): string {
  const text = JSON.stringify(payload);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * `V1GameResultRevision.score` 에서 정규시간 홈/원정 점수만 뽑아낸다 — 두 응답 형태
 * (`{regulation, goals, ...}` 레거시 백필 / `{home, away}` 이 화면이 만든 결과)를 모두
 * 처리한다. `scoreLabel`(`team-match-result-client.tsx`)과 같은 분기 로직이지만 그쪽은
 * 문자열 렌더링용이고 이쪽은 폼 재구성(재수화)용이라 별도 함수로 둔다 — 하나로 합치면
 * 렌더링 전용 컴포넌트가 폼 상태 재구성 책임까지 지게 돼 테스트 안전성이 떨어진다.
 */
export function revisionScoreHome(revision: V1GameResultRevision): number {
  const score = revision.score;
  if (!score) return 0;
  if ('regulation' in score) return score.regulation?.home ?? 0;
  return score.home;
}

export function revisionScoreAway(revision: V1GameResultRevision): number {
  const score = revision.score;
  if (!score) return 0;
  if ('regulation' in score) return score.regulation?.away ?? 0;
  return score.away;
}

/**
 * "수정하기" 클릭 시 로컬 폼을 서버에 이미 존재하는 DRAFT/SUBMITTED revision 내용으로
 * 되살린다. 같은 세션에서 "결과 작성 완료"를 누른 직후라면 로컬 state가 이미 이 값들을
 * 그대로 갖고 있어 이 함수가 필요 없지만(그 경로는 절대 값을 초기화하지 않는다), 새로고침
 * 후 "수정하기"를 누르는 경우(로컬 state는 비어 있고 서버에만 DRAFT가 있는 경우) 이 함수
 * 없이는 빈 폼이 뜬다.
 *
 * `resultParticipants` 에는 선수별 goals/cards **합계**만 있고 "몇 번째 골을 누가
 * 넣었는지" 순서 정보는 없다 — 재구성 시 한 선수의 goals=2면 그 선수를 득점자로 지정한
 * 골 슬롯 2개를 만든다. missingScorer 로 인해 참가자 합계보다 총 스코어가 크면(득점자를
 * 지정하지 않은 골이 있었던 경우) 남는 슬롯은 미지정(participantId: null)으로 채운다.
 */
export function hydrateResultFormFromRevision(revision: V1GameResultRevision): {
  homeGoals: GoalDraft[];
  awayGoals: number;
  cardDrafts: CardDraft[];
  mvpParticipantId: string;
  reason: string;
  substituteIds: string[];
} {
  const homeGoals: GoalDraft[] = [];
  const cardDrafts: CardDraft[] = [];
  // 출전 게이트가 붙은 뒤 제출된 revision에는 출전자만 실리므로, 그 안의 non-starter
  // 행은 곧 "교체로 들어간 선수" = 복원할 체크 목록이다.
  //
  // 단, 게이트 이전에 제출된 revision은 벤치를 포함한 로스터 전원을 담고 있어 그
  // 구분이 성립하지 않는다(정정 요청을 받아 지금 다시 열린 CHANGE_REQUESTED
  // revision이 딱 그럴 수 있다) — 그 경우 실제로 뛰지 않은 선수까지 체크된 채로
  // 복원된다. 그래도 복원을 유지하는 쪽을 택한다: 잘못 체크된 선수는 "출전 선수"
  // 목록에 그대로 보여 호스트가 해제할 수 있지만, 반대로 비워두면 정말 교체 출전한
  // 선수가 아무 표시 없이 결과에서 빠져 그대로 제출되기 때문이다. 눈에 보이는 과잉이
  // 조용한 누락보다 고치기 쉽다.
  const substituteIds = revision.resultParticipants
    .filter((row) => !row.started)
    .map((row) => row.participantId);
  for (const row of revision.resultParticipants) {
    for (let i = 0; i < row.goals; i += 1) {
      homeGoals.push({ key: randomUuid(), participantId: row.participantId });
    }
    for (let i = 0; i < row.cards.yellow; i += 1) {
      cardDrafts.push({ key: randomUuid(), participantId: row.participantId, type: 'yellow' });
    }
    for (let i = 0; i < row.cards.red; i += 1) {
      cardDrafts.push({ key: randomUuid(), participantId: row.participantId, type: 'red' });
    }
  }
  const homeScore = revisionScoreHome(revision);
  while (homeGoals.length < homeScore) {
    homeGoals.push({ key: randomUuid(), participantId: null });
  }

  return {
    homeGoals,
    awayGoals: revisionScoreAway(revision),
    cardDrafts,
    mvpParticipantId: revision.mvpParticipantId ?? '',
    reason: revision.reason ?? '',
    substituteIds,
  };
}

/** 운영 콘솔(tournament-ops)과 같은 카드 판정 용어로 통일 — "경고"/"퇴장" 대신
 * "옐로카드"/"레드카드"를 쓴다(같은 사건을 화면마다 다른 단어로 부르지 않기 위함). */
export const CARD_TYPE_LABEL: Record<'yellow' | 'red', string> = {
  yellow: '옐로카드',
  red: '레드카드',
};

export const RESULT_REVISION_STATE_LABEL: Record<V1GameResultRevisionState, string> = {
  DRAFT: '작성 중',
  SUBMITTED: '상대팀 승인 대기',
  CHANGE_REQUESTED: '정정 요청됨',
  SUPPLEMENT_REQUESTED: '보완 요청됨',
  REJECTED: '반려됨',
  OFFICIAL: '공식 확정',
  VOID: '무효 처리됨',
};
