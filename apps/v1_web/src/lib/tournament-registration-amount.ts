/**
 * 이미 낸 신청의 금액. 서버는 신청 시점 금액을 `payment.amount` 로 남기므로, 그 뒤 참가비가
 * 바뀌어도 신청 이후 화면은 이 값을 읽어야 한다. 결제 레코드가 없을 때만 현재 참가비로 갈음한다.
 * 신청 전(앞으로 청구될 돈) 화면은 `tournament.entryFee` 를 그대로 쓴다.
 */
export function resolveRegistrationAmount(
  registration: { payment: { amount: number } | null } | null | undefined,
  tournament: { entryFee: number },
): number {
  return registration?.payment?.amount ?? tournament.entryFee;
}
