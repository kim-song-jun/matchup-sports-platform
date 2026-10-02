
/**
 * 관전자에게 **점수를 어떤 자격으로 보여줄지**를 정하는 단일 규칙 (Task 166).
 *
 * ## 왜 생겼나
 * 정본 §4 가 결과 흐름을 "종료 → 결과 보내기 → 어드민 확인" 으로 확정하면서, 그 사이
 * 구간(제출됐지만 아직 확정 전)에 **점수 + "확정 전" 태그**를 보여주기로 했다. 그전에는
 * 이 구간이 `unavailable` 이라 경기가 끝났는데도 **점수가 아예 안 보였다** — 관전자에겐
 * "결과가 없다" 와 "확정을 기다린다" 가 구분되지 않았다.
 *
 * ## 세 자리가 같은 규칙을 각자 쓰고 있었다
 * `getMatch`(대회 경기 상세) · `getLeagueFixtureRecord`(리그 경기) · `presentScheduleEntry`
 * (일정 카드) 가 같은 3항 삼항식을 복사해 두고 있었다. 한 곳만 고치면 나머지 둘이 조용히
 * 갈리므로 여기 한 곳으로 모은다.
 *
 * ## `official_only` 는 그대로 감춘다 — 이게 이 함수의 핵심 제약이다
 * 공개 가시성 매트릭스(D-06, Task 24 에서 frozen)에서 `official_only` 는 **확정 전 숫자를
 * 일부러 내보내지 않는** 정책이다. "확정 전" 점수를 그 모드에까지 실으면 운영자가 명시적으로
 * 고른 정책을 이 변경이 뒤집는 것이 된다. 그래서 pending 점수는 `live` 모드에서만 나간다
 * (`status_only` 는 애초에 모든 점수를 가린다).
 */
/** 공개 응답에 실리는 점수 값. 승부차기는 정규시간과 별도로 싣는다. */
export type PublicScoreValue = {
  home: number;
  away: number;
  penalties: { home: number; away: number } | null;
};

export type PublicScoreStatus = 'unavailable' | 'live' | 'official' | 'pending';

export interface PublicScorePresentationInput {
  /** 이 경기에 적용된 실효 가시성 모드. */
  readonly mode: 'status_only' | 'live' | 'official_only';
  /** 확정본이 실제로 보여줄 수 있는 상태인지(포인터 + 점수 + officialAt 이 모두 갖춰짐). */
  readonly showOfficialResult: boolean;
  readonly officialScore: PublicScoreValue | null;
  /** 진행 중 집계 점수. 없으면 null. */
  readonly liveScore: PublicScoreValue | null;
  /** 최신 리비전이 SUBMITTED 일 때 그 점수. 그 밖에는 null. */
  readonly submittedScore: PublicScoreValue | null;
}

export interface PublicScorePresentation {
  readonly scoreStatus: PublicScoreStatus;
  readonly score: PublicScoreValue | null;
}

export function resolvePublicScorePresentation(
  input: PublicScorePresentationInput,
): PublicScorePresentation {
  // 확정본이 가장 강한 신호다 — 다른 무엇보다 먼저.
  if (input.showOfficialResult) {
    return {
      scoreStatus: 'official',
      score: input.mode === 'status_only' ? null : input.officialScore,
    };
  }
  // `status_only` 는 숫자를 전부 가린다. 상태(scoreStatus)까지 숨기지는 않는다 —
  // 그건 이 모드가 원래 내보내던 것이고, 이 변경이 넓히는 대상이 아니다.
  if (input.mode === 'status_only') {
    return { scoreStatus: input.liveScore !== null ? 'live' : 'unavailable', score: null };
  }
  if (input.liveScore !== null) {
    return { scoreStatus: 'live', score: input.liveScore };
  }
  // **여기가 이번에 생긴 구간이다.** `official_only` 는 위 주석대로 제외한다.
  if (input.submittedScore !== null && input.mode === 'live') {
    return { scoreStatus: 'pending', score: input.submittedScore };
  }
  return { scoreStatus: 'unavailable', score: null };
}
