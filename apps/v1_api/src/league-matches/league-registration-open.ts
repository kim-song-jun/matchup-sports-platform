/**
 * "지금 참가 신청을 받는가" 를 **서버가 판정한다.**
 *
 * 이 판정은 등록 서비스(`tournament-registrations.service.ts`)가 실제로 던지는 조건과
 * **같아야 한다.** 갈리면 화면은 "모집 중" 버튼을 그리는데 누르면 409 가 난다.
 *
 * ## 경계가 정확히 어디인가
 * 등록 서비스는 **`deadline < now` 일 때만** 닫는다:
 * ```
 * if (registrationDeadlineAt && registrationDeadlineAt.getTime() < Date.now()) → 409
 * ```
 * 즉 **마감 시각과 정확히 같은 순간은 아직 열려 있다.** 그래서 여기도 `>=` 다 —
 * 처음에 `>` 로 적었다가 그 1ms 만큼 어긋났고, Copilot 리뷰가 그 자리를 짚었다.
 * 부등호 하나가 "버튼은 있는데 안 눌린다" 와 "없는데 눌러야 한다" 를 가른다.
 *
 * `null` 마감은 **기한 없이 열림**이지 "안 받음" 이 아니다 — 등록 서비스도 `&&` 로 묶어
 * 그렇게 읽는다. 받는지 여부를 정하는 것은 `status` 다.
 */
export function isLeagueRegistrationOpen(
  status: string,
  registrationDeadlineAt: Date | null,
  now: number = Date.now(),
): boolean {
  if (status !== 'open') return false;
  if (registrationDeadlineAt === null) return true;
  return registrationDeadlineAt.getTime() >= now;
}
