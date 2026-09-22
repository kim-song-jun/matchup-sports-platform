import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GameScoreDto } from './game-result.dto';

describe('GameScoreDto submatches', () => {
  async function errorsFor(value: unknown) {
    return validate(plainToInstance(GameScoreDto, value), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
  }

  it('accepts an ordered optional submatch breakdown', async () => {
    await expect(
      errorsFor({
        home: 3,
        away: 4,
        subMatches: [
          { id: '188bf38e-dd37-4ef0-934d-4528d86b6ee8', title: '1경기', home: 2, away: 1 },
          { id: 'de06db58-da6f-451d-99e5-17ee17d079cf', title: '2경기', home: 1, away: 3 },
        ],
      }),
    ).resolves.toHaveLength(0);
  });

  it('rejects malformed or non-whitelisted submatch values', async () => {
    const errors = await errorsFor({
      home: 1,
      away: 0,
      subMatches: [{ id: 'not-a-uuid', title: '', home: -1, away: 0, hidden: true }],
    });
    expect(errors.some((error) => error.property === 'subMatches')).toBe(true);
  });
});
