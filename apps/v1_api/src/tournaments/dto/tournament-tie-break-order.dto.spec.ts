import { validate } from 'class-validator';
import { CreateTournamentDto, UpdateTournamentDto } from './admin-tournament.dto';

const ORDER = ['points', 'goal_difference', 'goals_for', 'head_to_head', 'fair_play', 'seeded_draw'];

// The slot layout itself is checked by assertValidTieBreakOrder; the DTO only guards the wire shape.
describe.each([CreateTournamentDto, UpdateTournamentDto])('%p tieBreakOrder', (Dto) => {
  const errorsFor = async (tieBreakOrder: unknown) =>
    (await validate(Object.assign(new Dto(), { tieBreakOrder }), { skipMissingProperties: true }))
      .filter((error) => error.property === 'tieBreakOrder');

  it('accepts a list of strings and null (reset to default)', async () => {
    expect(await errorsFor(ORDER)).toHaveLength(0);
    expect(await errorsFor(null)).toHaveLength(0);
  });

  it.each([
    ['a bare string', 'points'],
    ['an object', { points: 1 }],
    ['non-string slots', ['points', 1, 'goal_difference', 'goals_for', 'fair_play', 'seeded_draw']],
    ['more than six slots', [...ORDER, 'extra']],
  ])('rejects %s', async (_label, value) => {
    expect(await errorsFor(value)).not.toHaveLength(0);
  });
});
