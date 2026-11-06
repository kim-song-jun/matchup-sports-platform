import { validate } from 'class-validator';
import { CreateTournamentDto, UpdateTournamentDto } from './admin-tournament.dto';

// Both endpoints must accept a complete categorized editor, not only the old 500-char text.
describe.each([CreateTournamentDto, UpdateTournamentDto])('%p prize breakdown', (Dto) => {
  it('accepts twelve categorized rows with names, goods and JSON escaping', async () => {
    const prizeBreakdown = '@teameet/prizes/v1:' + JSON.stringify(Array.from({ length: 12 }, () => ({
      category: '개인 시상', label: '상'.repeat(20), amount: '\\'.repeat(80),
    })));
    expect(prizeBreakdown.length).toBeGreaterThan(500);
    const errors = await validate(Object.assign(new Dto(), { prizeBreakdown }), { skipMissingProperties: true });
    expect(errors.filter((error) => error.property === 'prizeBreakdown')).toHaveLength(0);
  });
  it('rejects oversized or non-string prize plans', async () => {
    for (const prizeBreakdown of ['상'.repeat(4001), { category: '개인 시상' }]) {
      const errors = await validate(Object.assign(new Dto(), { prizeBreakdown }), { skipMissingProperties: true });
      expect(errors.some((error) => error.property === 'prizeBreakdown')).toBe(true);
    }
  });
});
