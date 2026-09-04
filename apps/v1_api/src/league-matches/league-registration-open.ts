/**
 * "지금 참가 신청을 받는가" 를 **서버가 판정한다.**
 *
 * ## 판정은 마감이 한다 — `status` 가 아니다 (2026-09-04 사용자 확정)
 * 정본 §6: *"명시적 신청 마감(`registrationDeadlineAt`). **대진 생성은 신청 상태를 건드리지
 * 않는다.** 운영자가 대진을 미리 짜 두고도 신청을 계속 받을 수 있다."*
 *
 * 예전엔 `status === 'open'` 을 요구했는데, `generateFixtures` 가 거울 status 를
 * `in_progress` 로 옮기기 때문에 **대진이 하나라도 있는 리그는 신청을 영영 못 열었다**
 * (2026-09-04 alpha 실측: 409 `LEAGUE_NOT_DRAFT`). 폐기된 규칙("대진 생성 = 신청 창 닫힘",
 * Task 164 BE-3)이 코드에 남아 있던 것이다.
 *
 * 그래서 **`status` 는 수명주기 표시 전용**이 되고, 여기서는 되돌릴 수 없는 상태
 * (`completed`·`cancelled`)만 배제한다.
 *
 * ## `null` 마감은 "안 받음" 이다
 * 정본 §6 이 그 대가를 명시한다: *"마감을 **누군가 정해야 한다** — 안 정하면(`null`) 그
 * 리그는 신청을 안 받는다. 기존 alpha 리그가 전부 그 상태다(백필하지 않는다)."*
 * 판정에서 `status` 를 뺀 이상 **열렸다는 신호는 마감밖에 없다** — `null` 을 "기한 없이
 * 열림" 으로 읽으면 아무도 열지 않은 리그가 전부 모집 중이 된다.
 *
 * ## 경계는 서버 쪽과 같아야 한다
 * 등록 서비스는 `deadline < now` 일 때만 닫는다 — **마감 시각과 같은 순간은 아직 열려
 * 있다.** 그래서 여기도 `>=` 다(부등호 하나가 "버튼은 있는데 안 눌린다" 를 만든다).
 */
export function isLeagueRegistrationOpen(
  status: string,
  registrationDeadlineAt: Date | null,
  now: number = Date.now(),
): boolean {
  // 끝났거나 취소된 리그는 마감이 남아 있어도 받지 않는다 — 되돌릴 수 없는 상태다.
  if (status === 'completed' || status === 'cancelled') return false;
  if (registrationDeadlineAt === null) return false;
  return registrationDeadlineAt.getTime() >= now;
}
