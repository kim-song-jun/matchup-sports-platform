import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateLeagueMatchDto, UpdateLeagueVisibilityDto } from './league-match.dto';

const valid = {
  title: '부산 리그',
  sportId: '6d1a6f4e-b918-48cd-8cfe-25523edd38d5',
  startsOn: '2026-09-20T00:00:00.000Z',
  endsOn: '2026-10-20T00:00:00.000Z',
  teamIds: [
    'd8168000-0000-4000-8000-000000000101',
    'd8168000-0000-4000-8000-000000000102',
  ],
};

describe('CreateLeagueMatchDto region identifiers', () => {
  it('accepts the non-UUID master-region identifier used by the API', async () => {
    const errors = await validate(
      plainToInstance(CreateLeagueMatchDto, { ...valid, regionId: 'region-busan-jung' }),
    );

    expect(errors).toHaveLength(0);
  });

  it.each(['', null, 42, {}])('rejects an invalid region identifier: %p', async (regionId) => {
    const errors = await validate(plainToInstance(CreateLeagueMatchDto, { ...valid, regionId }));

    expect(errors.some((error) => error.property === 'regionId')).toBe(true);
  });
});

describe('UpdateLeagueVisibilityDto', () => {
  it('accepts an explicit boolean false', async () => {
    const errors = await validate(plainToInstance(UpdateLeagueVisibilityDto, { isPublic: false }));
    expect(errors).toHaveLength(0);
  });

  it.each(['false', 0, null, undefined])('rejects a non-boolean visibility value: %p', async (isPublic) => {
    const errors = await validate(plainToInstance(UpdateLeagueVisibilityDto, { isPublic }));
    expect(errors.some((error) => error.property === 'isPublic')).toBe(true);
  });
});
