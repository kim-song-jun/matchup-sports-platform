import { assertOpponentCostWithinTotal } from './team-match-cost';

describe('team match cost note contract', () => {
  it.each([
    '총 50,000원 · 상대팀 80,000원',
    '총 0원 · 상대팀 1원',
    '총 100,000원 · 상대팀 100,001원',
  ])('rejects an opponent share above the total: %s', (costNote) => {
    expect(() => assertOpponentCostWithinTotal(costNote)).toThrow(
      expect.objectContaining({ response: expect.objectContaining({ code: 'VALIDATION_FAILED', details: { field: 'costNote' } }) }),
    );
  });

  it.each([
    '총 50,000원 · 상대팀 50,000원',
    '총 50,000원 · 상대팀 25,000원',
    '총 50,000원 · 상대팀 0원',
    '총 280,000원 · 상대팀 140,000원',
  ])('accepts an opponent share within the total: %s', (costNote) => {
    expect(() => assertOpponentCostWithinTotal(costNote)).not.toThrow();
  });

  it.each([null, undefined, '', '  ', '참가비 협의', '1인 10,000원', '각자 부담'])('leaves free-form notes alone: %s', (costNote) => {
    expect(() => assertOpponentCostWithinTotal(costNote)).not.toThrow();
  });
});
