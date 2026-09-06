/**
 * 명단을 **지금 고칠 수 있는가** 를 판정하는 규칙.
 *
 * **왜 별도 모듈인가** — 이 규칙을 쓰는 화면이 둘이다(팀장 명단 화면 · 내 신청 카드).
 * 처음엔 명단 화면 파일에서 직접 import 했는데, 그 파일은 훅을 여럿 쓰는 큰 클라이언트
 * 컴포넌트라 **판정 함수 두 개를 쓰려고 화면 하나가 통째로 다른 번들에 딸려 온다.**
 * 라우트끼리 묶이고 순환 import 위험도 생긴다(Copilot 리뷰 지적).
 *
 * 규칙 자체가 갈리면 **배지는 "수정 가능" 인데 눌러 들어가면 못 고치는** 상태가 난다 —
 * 실제로 그랬다(#4 후속). 두 화면이 이 모듈 하나만 본다.
 */

/**
 * 서버 `ROSTER_MUTABLE_TOURNAMENT_STATUSES`(`apps/v1_api/.../roster-cleanup.ts`)와 같은 집합.
 * 감사 finding #1(2026-08): 화면이 대회 status 를 안 봐서 완료·취소된 대회에서도
 * '수정 가능' 이 떠 있다가 서버 409(`TOURNAMENT_ROSTER_NOT_MUTABLE`)로 실패했다.
 * 서버 값이 바뀌면 이 상수도 함께 고친다.
 */
const ROSTER_MUTABLE_TOURNAMENT_STATUSES = new Set(['open', 'closed', 'in_progress']);

/** 대회가 아직 로딩 중이면(undefined) 막지 않는다 — 기존 낙관적 렌더링과 동일. */
export function isTournamentRosterMutable(status: string | null | undefined): boolean {
  if (!status) return true;
  return ROSTER_MUTABLE_TOURNAMENT_STATUSES.has(status);
}

export type RosterDeadlineState = {
  /** 명단 제출 마감이 지나 예외 없이는 편집이 막힌 상태 */
  blocked: boolean;
  /** 마감은 지났지만 어드민이 예외를 허용해 편집 가능한 상태 */
  overridden: boolean;
};

/**
 * 명단 제출 마감 상태.
 *
 * - 마감일이 없으면 항상 편집 가능.
 * - 마감일이 지났고 어드민 예외(override)가 없으면 편집 차단.
 * - 마감일이 지났어도 어드민 예외가 있으면 편집 가능(`overridden` 으로 안내만 표시).
 */
export function getRosterDeadlineState(
  rosterDeadlineAt: string | null | undefined,
  overrideAt: string | null | undefined,
  now: Date = new Date(),
): RosterDeadlineState {
  if (!rosterDeadlineAt) return { blocked: false, overridden: false };
  const deadline = new Date(rosterDeadlineAt);
  if (Number.isNaN(deadline.getTime())) return { blocked: false, overridden: false };
  const isPast = now.getTime() > deadline.getTime();
  if (!isPast) return { blocked: false, overridden: false };
  return overrideAt ? { blocked: false, overridden: true } : { blocked: true, overridden: false };
}
