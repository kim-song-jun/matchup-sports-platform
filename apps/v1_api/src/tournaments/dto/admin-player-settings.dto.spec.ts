import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateAdminPlayerSettingsDto } from './tournament-player.dto';

describe('admin player settings DTO', () => {
  it.each([0, 99, null])('accepts jersey %s with GK false', async (jerseyNumber) => {
    expect(await validate(plainToInstance(UpdateAdminPlayerSettingsDto, { jerseyNumber, goalkeeper: false }))).toHaveLength(0);
  });
  it('permits jersey-only edits while retaining legacy GK state', async () => {
    expect(await validate(plainToInstance(UpdateAdminPlayerSettingsDto, { jerseyNumber: 1 }))).toHaveLength(0);
  });
  it.each([
    { goalkeeper: true }, { jerseyNumber: -1, goalkeeper: true },
    { jerseyNumber: 100, goalkeeper: true }, { jerseyNumber: 1.5, goalkeeper: true },
    { jerseyNumber: '7', goalkeeper: true }, { jerseyNumber: 7, goalkeeper: 'false' },
    { jerseyNumber: 7, goalkeeper: null },
  ])('rejects invalid/missing values %j', async (body) => {
    expect((await validate(plainToInstance(UpdateAdminPlayerSettingsDto, body))).length).toBeGreaterThan(0);
  });
});
