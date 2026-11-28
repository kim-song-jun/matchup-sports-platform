import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateTournamentDto } from './admin-tournament.dto';

const genderErrors = async (plain: object) =>
  (await validate(plainToInstance(UpdateTournamentDto, plain))).filter((error) => error.property === 'genderCategory');

describe('UpdateTournamentDto genderCategory', () => {
  it.each(['mixed', 'male', 'female'])('accepts %p', async (value) => {
    expect(await genderErrors({ genderCategory: value })).toHaveLength(0);
  });

  it('accepts omission (keep the saved category) and explicit null (clear it back to no gender split)', async () => {
    expect(await genderErrors({})).toHaveLength(0);
    expect(await genderErrors({ genderCategory: null })).toHaveLength(0);
  });

  it.each(['none', 'unspecified', '', 0, true])('rejects %p', async (value) => {
    expect((await genderErrors({ genderCategory: value })).length).toBeGreaterThan(0);
  });
});
