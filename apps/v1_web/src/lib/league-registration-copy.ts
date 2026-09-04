import { formatTournamentDateTimeShort } from './date-utils';

/**
 * 리그 참가 신청 창을 사람이 읽는 한 문장으로 만든다.
 *
 * **왜 공유하나** — 이 문장은 어드민의 두 화면(대진 화면의 요약 카드 · 신청 관리 화면의
 * 헤더)에 같은 모양으로 나온다. 처음엔 각자 인라인 삼항식으로 적혀 있었고, 그래서 **닫힌
 * 이유를 가르는 수정이 한쪽에만 들어갔다.** 판정 자체를 여기 한 곳에 둔다.
 *
 * **닫힌 이유를 가른다(이 함수가 존재하는 진짜 이유).** `registrationOpen` 이 거짓인 경우는
 * 두 가지고, 운영자가 해야 할 일이 서로 다르다:
 *
 * | 이유 | 화면이 말해야 하는 것 | 운영자의 다음 행동 |
 * |---|---|---|
 * | 마감이 지났다 | "신청이 마감됐어요" | 마감을 미래로 바꾸면 다시 열린다 |
 * | 리그가 끝났거나 취소됐다 | "끝났거나 취소된 리그" | **마감을 바꿔도 열리지 않는다** |
 *
 * 둘을 섞으면 마감이 **미래인데도** "마감됐어요" 라고 말하게 된다(끝난 리그의 마감은 보통
 * 미래로 남아 있다). 그러면 운영자는 마감을 다시 넣어 보고, 서버는 409
 * `LEAGUE_REGISTRATION_NOT_ALLOWED` 로 막는다 — 화면이 원인을 숨긴 것이다.
 *
 * `state === 'completed'` 는 통합 축 `status` 의 `completed` 와 `cancelled` **둘 다**를
 * 가리킨다(`LEAGUE_STATE_BY_STATUS`). 화면은 그 둘을 구분할 방법이 없으므로 문구도
 * 서버 가드와 같은 표현("끝났거나 취소된")을 쓴다.
 */
export function describeLeagueRegistrationWindow(input: {
  /** 리그 수명주기. `'completed'` 는 끝난 리그와 취소된 리그를 함께 가리킨다. */
  state: 'draft' | 'active' | 'completed';
  /** 지금 신청을 받는가 — **서버 판정값**을 그대로 받는다(화면이 다시 계산하지 않는다). */
  registrationOpen: boolean;
  registrationDeadlineAt: string | null;
  /**
   * 마감이 아직 없을 때 안내할 다음 행동. 화면마다 입구가 달라서(한쪽은 이 카드에 입력칸이
   * 있고, 다른 쪽은 "신청 관리" 로 넘어가야 한다) 문장을 호출자가 준다.
   */
  noDeadlineHint: string;
}): string {
  const { state, registrationOpen, registrationDeadlineAt, noDeadlineHint } = input;
  if (registrationDeadlineAt === null) {
    // 정본 §6: 마감을 안 정하면 그 리그는 신청을 안 받는다. 그래서 이 가지는 열림/닫힘
    // 어느 쪽에서도 같은 안내다 — "먼저 마감을 정해라".
    return noDeadlineHint;
  }
  const deadlineText =
    formatTournamentDateTimeShort(registrationDeadlineAt) ?? registrationDeadlineAt;
  if (registrationOpen) {
    return `${deadlineText}까지 신청을 받아요.`;
  }
  if (state === 'completed') {
    return '끝났거나 취소된 리그라 신청을 받지 않아요.';
  }
  return `신청이 마감됐어요. 마감은 ${deadlineText} 였어요.`;
}
