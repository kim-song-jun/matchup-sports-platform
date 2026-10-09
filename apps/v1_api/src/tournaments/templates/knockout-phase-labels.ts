import type { V1TournamentGroupPhase } from '@prisma/client';

export type KnockoutPhase = Exclude<V1TournamentGroupPhase, 'group'>;

// 조 이름은 웹 `templateFor`, 라운드 문자열은 `tournament-round-label.ts` 의 결선 라벨과 같다.
// 순서 계약(1c·PR-4 가 그대로 따른다): 결선 그룹·경기 번호는 ... → 4강 → 결승 → 3·4위전 (결승이 3·4위전보다 앞).
export const GROUP_NAME: Record<KnockoutPhase, string> = {
  round16: '16강', round12: '12강', quarter: '8강', semi: '4강', final: '결승', third_place: '3위 결정전',
};
export const ROUND_LABEL: Record<KnockoutPhase, string> = {
  round16: '16강', round12: '12강', quarter: '8강', semi: '4강', final: '결승', third_place: '3·4위전',
};
export const FIXTURES_IN_PHASE: Record<KnockoutPhase, number> = { round16: 8, round12: 4, quarter: 4, semi: 2, final: 1, third_place: 1 };
