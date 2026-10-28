export const BYE_ROUNDS = {
  round64: { label: '64강', next: 'round32', nextLabel: '32강', positions: 64 },
  round32: { label: '32강', next: 'round16', nextLabel: '16강', positions: 32 },
  round16: { label: '16강', next: 'quarter', nextLabel: '8강', positions: 16 },
  round12: { label: '12강', next: 'quarter', nextLabel: '8강', positions: 8 },
  quarter: { label: '8강', next: 'semi', nextLabel: '4강', positions: 8 },
  semi: { label: '4강', next: 'final', nextLabel: '결승', positions: 4 },
} as const;
export function byeRound(phase: string) {
  return BYE_ROUNDS[phase as keyof typeof BYE_ROUNDS];
}

// 서버 tournament-bracket-phases.ts 와 같은 표 — 바꾸면 둘 다.
export const BRACKET_SOURCE_PHASES: Readonly<Record<string, readonly string[]>> = {
  round32: ['round64'],
  round16: ['round32'],
  quarter: ['round16', 'round12'],
  semi: ['quarter'],
  final: ['semi'],
  third_place: ['semi'],
};
