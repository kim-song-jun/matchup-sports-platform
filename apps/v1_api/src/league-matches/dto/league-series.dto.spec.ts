import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateLeagueSeriesDto } from './league-series.dto';

const valid = {
  title: '부산 시리즈',
  sportId: '6d1a6f4e-b918-48cd-8cfe-25523edd38d5',
  regionId: 'region-busan-jung',
  tierCount: 2,
  promotionRule: { mode: 'fixed', fixedCount: 1 },
};

describe('CreateLeagueSeriesDto region identifiers', () => {
  it.each([
    'region-busan-jung',
    '6d1a6f4e-b918-48cd-8cfe-25523edd38d5',
  ])('accepts a string master-region identifier: %s', async (regionId) => {
    const errors = await validate(plainToInstance(CreateLeagueSeriesDto, { ...valid, regionId }));

    expect(errors).toHaveLength(0);
  });

  it.each(['', null, 42, {}, 'x'.repeat(101)])('rejects an invalid region identifier: %p', async (regionId) => {
    const errors = await validate(plainToInstance(CreateLeagueSeriesDto, { ...valid, regionId }));

    expect(errors.some((error) => error.property === 'regionId')).toBe(true);
  });
});
