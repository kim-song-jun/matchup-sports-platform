/**
 * 티어 번호 → 화면 문구.
 *
 * 원래 `league-series-admin.service.ts` 안에 있었다. 그 파일은 Prisma·알림·공개 서비스를
 * 끌어오는 무거운 서비스 모듈이라, **이 두 줄을 쓰려고 import 하면 순환이 생긴다** —
 * `league-team-admission.ts` → `league-series-admin.service.ts` → `league-team-admission.ts`
 * (Copilot 리뷰가 잡았다). 순수 함수를 순수 모듈로 내려 끊는다.
 */

/** 화면 문구는 A/B/C 가 아니라 국내 생활체육 관행대로 "N부"다. */
export function tierLabel(tier: number): string {
  return `${tier}부`;
}
