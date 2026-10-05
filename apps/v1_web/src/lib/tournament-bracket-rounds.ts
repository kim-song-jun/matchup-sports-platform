export const BYE_ROUNDS = {
  round12: { label: '12강', next: 'quarter', nextLabel: '8강' },
  quarter: { label: '8강', next: 'semi', nextLabel: '4강' },
  semi: { label: '4강', next: 'final', nextLabel: '결승' },
} as const;
export function byeRound(phase: string) {
  return BYE_ROUNDS[phase as keyof typeof BYE_ROUNDS];
}
