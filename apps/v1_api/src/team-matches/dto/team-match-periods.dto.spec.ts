import 'reflect-metadata';
import { createGlobalValidationPipe } from '../../common/global-validation-pipe';
import { MutateTeamMatchDto, UpdateTeamMatchDto } from './mutate-team-match.dto';

const createBody = {
  hostTeamId: '11111111-1111-4111-8111-111111111111',
  sportId: '22222222-2222-4222-8222-222222222222',
  regionId: 'region-seoul-jongno',
  title: '일반 팀매치 경기 규칙',
  startsAt: '2098-10-13T09:00:00.000Z',
  manualPlaceName: '테스트 경기장',
};

describe.each([
  { route: 'POST create', metatype: MutateTeamMatchDto, body: createBody },
  {
    route: 'PATCH update',
    metatype: UpdateTeamMatchDto,
    body: { ...createBody, version: '2026-10-13T00:00:00.000Z' },
  },
])('general team-match periods through the global HTTP pipe ($route)', ({ metatype, body }) => {
  const parse = async (input: object): Promise<object> =>
    createGlobalValidationPipe().transform(input, { type: 'body', metatype });

  it.each([
    {
      name: 'one period',
      input: [{ durationMinutes: 25 }],
      expected: [{ durationMinutes: 25 }],
    },
    {
      name: 'two periods',
      input: [{ durationMinutes: 45 }, { durationMinutes: 45 }],
      expected: [{ durationMinutes: 45 }, { durationMinutes: 45 }],
    },
    {
      name: 'the positive integer lower boundary',
      input: [{ durationMinutes: 1 }],
      expected: [{ durationMinutes: 1 }],
    },
  ])('accepts $name without dropping its duration', async ({ input, expected }) => {
    await expect(parse({ ...body, periods: input })).resolves.toMatchObject({
      ...body,
      periods: expected,
    });
  });

  it('keeps existing requests valid when periods is omitted', async () => {
    const parsed = await parse(body);

    expect(parsed).toMatchObject(body);
    expect(Reflect.get(parsed, 'periods')).toBeUndefined();
  });

  it.each([
    { name: 'null instead of omission', periods: null },
    { name: 'no periods', periods: [] },
    {
      name: 'three periods',
      periods: [{ durationMinutes: 25 }, { durationMinutes: 25 }, { durationMinutes: 25 }],
    },
    { name: 'a scalar count instead of nested periods', periods: 1 },
    { name: 'a primitive period entry', periods: [25] },
    { name: 'a null period entry', periods: [null] },
    { name: 'an empty array period entry', periods: [[]] },
    { name: 'a nested array period entry', periods: [[{ durationMinutes: 25 }]] },
    { name: 'a missing duration', periods: [{}] },
    { name: 'a null duration', periods: [{ durationMinutes: null }] },
    { name: 'a zero duration', periods: [{ durationMinutes: 0 }] },
    { name: 'a negative duration', periods: [{ durationMinutes: -1 }] },
    { name: 'a fractional duration', periods: [{ durationMinutes: 1.5 }] },
    { name: 'a numeric string despite implicit conversion', periods: [{ durationMinutes: '25' }] },
    { name: 'a boolean despite implicit conversion', periods: [{ durationMinutes: true }] },
    {
      name: 'a UI-only field nested in a period',
      periods: [{ durationMinutes: 25, label: '전반' }],
    },
  ])('rejects $name as an HTTP validation error', async ({ periods }) => {
    await expect(parse({ ...body, periods })).rejects.toMatchObject({
      response: {
        code: 'VALIDATION_ERROR',
        details: expect.arrayContaining([expect.objectContaining({ field: 'periods' })]),
      },
      status: 400,
    });
  });

  it('still rejects root UI-only state when periods are valid', async () => {
    await expect(parse({ ...body, periods: [{ durationMinutes: 25 }], rulesScreen: true }))
      .rejects.toMatchObject({
        response: {
          code: 'VALIDATION_ERROR',
          details: expect.arrayContaining([expect.objectContaining({ field: 'rulesScreen' })]),
        },
        status: 400,
      });
  });
});
