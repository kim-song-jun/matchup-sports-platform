import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateLeagueMatchDto, UpdateLeagueDisciplineDto, UpdateLeagueVisibilityDto } from './league-match.dto';
import { createGlobalValidationPipe } from '../../common/global-validation-pipe';

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

describe('CreateLeagueMatchDto team capacity through the HTTP validation pipe', () => {
  const metadata = { type: 'body' as const, metatype: CreateLeagueMatchDto };
  const parse = (changes: object) => createGlobalValidationPipe().transform(
    { ...valid, regionId: 'region-busan-jung', ...changes },
    metadata,
  );

  it('preserves player roster limits when team capacity is omitted', async () => {
    const dto = await parse({ minPlayers: 5, maxPlayers: 12 });

    expect(dto).toMatchObject({ minPlayers: 5, maxPlayers: 12 });
    expect(dto.maxTeams).toBeUndefined();
  });

  it('preserves explicit null for unlimited team capacity', async () => {
    await expect(parse({ maxTeams: null })).resolves.toMatchObject({ maxTeams: null });
  });

  it.each([1, 2, 21, 51, 2147483647])('accepts positive integer team capacity %p without a roster or template cap', async (maxTeams) => {
    await expect(parse({ maxTeams })).resolves.toMatchObject({ maxTeams });
  });

  it.each([0, -1, 1.5, '3', true, false, 2147483648])('rejects invalid team capacity %p without coercion', async (maxTeams) => {
    await expect(parse({ maxTeams })).rejects.toMatchObject({
      status: 400,
      response: {
        code: 'VALIDATION_ERROR',
        details: expect.arrayContaining([expect.objectContaining({ field: 'maxTeams' })]),
      },
    });
  });

  it.each([
    { minPlayers: 1, maxPlayers: null, maxTeams: 2 },
    { minPlayers: 5, maxPlayers: 12, maxTeams: 1 },
    { minPlayers: 1, maxPlayers: 50, maxTeams: 51 },
  ])('preserves independent player roster limits and team capacity: %j', async (limits) => {
    await expect(parse(limits)).resolves.toMatchObject(limits);
  });

  it.each([0, 51])('retains the player roster maximum range when team capacity is valid: %p', async (maxPlayers) => {
    await expect(parse({ minPlayers: 1, maxPlayers, maxTeams: 51 })).rejects.toMatchObject({
      status: 400,
      response: {
        code: 'VALIDATION_ERROR',
        details: expect.arrayContaining([expect.objectContaining({ field: 'maxPlayers' })]),
      },
    });
  });
});

describe('UpdateLeagueVisibilityDto', () => {
  const metadata = { type: 'body' as const, metatype: UpdateLeagueVisibilityDto };

  it.each([false, true])('preserves explicit boolean %p through the HTTP validation pipe', async (isPublic) => {
    const dto = await createGlobalValidationPipe().transform({ isPublic }, metadata);
    expect(dto.isPublic).toBe(isPublic);
  });

  it.each(['false', 'true', '', 0, 1, null, undefined, {}, []])('rejects non-boolean %p through the HTTP validation pipe', async (isPublic) => {
    await expect(createGlobalValidationPipe().transform({ isPublic }, metadata)).rejects.toMatchObject({
      status: 400,
      response: { code: 'VALIDATION_ERROR' },
    });
  });
});

describe('team foul threshold on league DTOs', () => {
  const create = (teamFoulThreshold: unknown) => plainToInstance(CreateLeagueMatchDto, { ...valid, regionId: 'region-busan-jung', teamFoulThreshold });
  const discipline = (body: object) => plainToInstance(UpdateLeagueDisciplineDto, body);
  const on = async (dto: object) => (await validate(dto as never)).filter((error) => error.property === 'teamFoulThreshold');

  it.each([1, 5, 7, 20])('accepts %p when creating and when editing', async (value) => {
    expect(await on(create(value))).toHaveLength(0);
    expect(await on(discipline({ teamFoulThreshold: value }))).toHaveLength(0);
  });

  it('accepts omission and null (default 5) on both DTOs', async () => {
    expect(await on(create(undefined))).toHaveLength(0);
    expect(await on(create(null))).toHaveLength(0);
    expect(await on(discipline({}))).toHaveLength(0);
    expect(await on(discipline({ teamFoulThreshold: null }))).toHaveLength(0);
  });

  it.each([0, -1, 21, 2.5, '5', true])('rejects %p on both DTOs', async (value) => {
    expect((await on(create(value))).length).toBeGreaterThan(0);
    expect((await on(discipline({ teamFoulThreshold: value }))).length).toBeGreaterThan(0);
  });

  it('lets the edit DTO carry only the team foul threshold (suspension fields stay untouched)', async () => {
    const dto = discipline({ teamFoulThreshold: 6 });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.yellowAccumulationLimit).toBeUndefined();
    expect(dto.redCardSuspensionMatches).toBeUndefined();
  });
});
