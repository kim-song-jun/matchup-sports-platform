export const BYE_ROUNDS = {
  round12: { label: '12강', next: 'quarter', nextLabel: '8강', positions: 8 },
  quarter: { label: '8강', next: 'semi', nextLabel: '4강', positions: 8 },
  semi: { label: '4강', next: 'final', nextLabel: '결승', positions: 4 },
} as const;
export function byeRound(phase: string) {
  return BYE_ROUNDS[phase as keyof typeof BYE_ROUNDS];
}

// 서버 tournament-bracket-phases.ts 와 같은 표 — 바꾸면 둘 다.
export const BRACKET_SOURCE_PHASES: Readonly<Record<string, readonly string[]>> = {
  quarter: ['round16', 'round12'],
  semi: ['quarter'],
  final: ['semi'],
  third_place: ['semi'],
};
