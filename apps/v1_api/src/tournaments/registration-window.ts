/**
 * "지금 참가 신청을 받는가" — **대회와 정규 리그가 같은 규칙**을 쓴다(2026-10-27 사용자 확정).
 *
 * 운영자가 접수를 시작한 상태(`open`)이고, 마감 시각이 없거나 아직 지나지 않았을 때만 받는다.
 * 정규 리그도 예전처럼 마감 시각 하나로 열고 닫지 않는다 — 리그를 시작하면(`in_progress`) 신청이
 * 닫히고, 보류(`on_hold`) 중에도 받지 않는다.
 *
 * 마감 시각과 같은 순간까지는 열려 있다. 등록 서비스가 `deadline < now` 일 때만
 * `REGISTRATION_DEADLINE_PASSED` 로 막으므로 여기도 `>=` 다(부등호 하나가 "버튼은 있는데 안
 * 눌린다" 를 만든다). 목록 SQL(`tournament-list-query.ts`)과 웹
 * (`lib/tournament-registration-availability.ts`)도 같은 경계를 쓴다.
 */
export function isRegistrationWindowOpen(
  status: string,
  registrationDeadlineAt: Date | null,
  now: number = Date.now(),
): boolean {
  if (status !== 'open') return false;
  return !registrationDeadlineAt || registrationDeadlineAt.getTime() >= now;
}
