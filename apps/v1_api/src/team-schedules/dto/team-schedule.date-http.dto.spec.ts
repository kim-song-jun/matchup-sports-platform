import 'reflect-metadata';
import { createGlobalValidationPipe } from '../../common/global-validation-pipe';
import { CreateScheduleDto, UpdateScheduleDto } from './team-schedule.dto';

const createBody = {
  title: 'Training', type: 'TRAINING', timezone: 'Asia/Seoul',
  startAt: '2026-10-08T10:00:00+09:00', endAt: '2026-10-08T11:00:00+09:00',
};
const dateFields = ['startAt', 'endAt', 'rsvpDeadlineAt'] as const;

function validationFailure(field: string) {
  return {
    status: 400,
    response: {
      code: 'VALIDATION_ERROR', message: '입력값을 다시 확인해 주세요.',
      details: expect.arrayContaining([{
        field, messages: expect.arrayContaining([expect.any(String)]),
      }]),
    },
  };
}

describe.each([
  { name: 'create', metatype: CreateScheduleDto, base: createBody },
  { name: 'PATCH', metatype: UpdateScheduleDto, base: { expectedVersion: 0 } },
])('Team schedule $name actual HTTP DTO transformation', ({ metatype, base }) => {
  it.each([
    { startAt: '2026-10-08T10:00:00+09:00', endAt: '2026-10-08T11:00:00+09:00',
      expectedStart: '2026-10-08T10:00:00+09:00', expectedEnd: '2026-10-08T11:00:00+09:00' },
    { startAt: '2026-10-08', endAt: '2026-10-09', expectedStart: '2026-10-08', expectedEnd: '2026-10-09' },
    { startAt: '2026', endAt: '2027', expectedStart: '2026', expectedEnd: '2027' },
    { startAt: 2026, endAt: 2027, expectedStart: '2026', expectedEnd: '2027' },
  ])('accepts and transforms DTO-valid date values %j', async ({ startAt, endAt, expectedStart, expectedEnd }) => {
    // Given the exact application pipe and original DTO decorators.
    const pipe = createGlobalValidationPipe();
    // When raw HTTP scalar dates cross the application boundary.
    const dto: CreateScheduleDto | UpdateScheduleDto = await pipe.transform(
      { ...base, startAt, endAt }, { type: 'body', metatype },
    );
    // Then ISO/date-only/year strings survive and numeric years become strings.
    expect(dto).toBeInstanceOf(metatype);
    expect(dto).toMatchObject({ startAt: expectedStart, endAt: expectedEnd });
  });

  it.each(dateFields)('rejects malformed supplied %s with the real field error', async (field) => {
    // Given a body that is otherwise valid for this route.
    const pipe = createGlobalValidationPipe();
    // When an invalid date is supplied rather than omitted.
    const operation = pipe.transform({ ...base, [field]: 'not-a-date' }, { type: 'body', metatype });
    // Then the caller receives the global Korean validation envelope and field details.
    await expect(operation).rejects.toMatchObject(validationFailure(field));
  });

  it.each(dateFields)('rejects an ISO-string array in %s instead of treating it as a scalar', async (field) => {
    // Given a date-shaped array from a raw HTTP body.
    const pipe = createGlobalValidationPipe();
    // When transformation preserves its array shape.
    const operation = pipe.transform({ ...base, [field]: ['2026-10-08'] }, { type: 'body', metatype });
    // Then the actual IsDateString decorator rejects the array.
    await expect(operation).rejects.toMatchObject(validationFailure(field));
  });

  it.each(dateFields)('rejects a numeric-year array in %s instead of accepting a converted scalar', async (field) => {
    // Given a numeric array rather than the accepted numeric scalar year.
    const pipe = createGlobalValidationPipe();
    // When it crosses the exact HTTP validation boundary.
    const operation = pipe.transform({ ...base, [field]: [2026] }, { type: 'body', metatype });
    // Then array element conversion cannot satisfy the scalar date decorator.
    await expect(operation).rejects.toMatchObject(validationFailure(field));
  });
});

describe('Team schedule field-specific actual HTTP DTO contracts', () => {
  it('converts a numeric create RSVP year through its String metadata', async () => {
    // Given CreateScheduleDto's string-only optional RSVP property.
    const pipe = createGlobalValidationPipe();
    // When its raw scalar numeric year is transformed.
    const dto: CreateScheduleDto = await pipe.transform(
      { ...createBody, rsvpDeadlineAt: 2026 }, { type: 'body', metatype: CreateScheduleDto },
    );
    // Then implicit String conversion precedes the default date validator.
    expect(dto.rsvpDeadlineAt).toBe('2026');
  });

  it('rejects a numeric PATCH RSVP year because its nullable union has Object metadata', async () => {
    // Given UpdateScheduleDto's string-or-null RSVP property, distinct from startAt/endAt.
    const pipe = createGlobalValidationPipe();
    // When a numeric RSVP year is supplied to this DTO.
    const operation = pipe.transform({ expectedVersion: 0, rsvpDeadlineAt: 2026 }, { type: 'body', metatype: UpdateScheduleDto });
    // Then the real nullable-union field remains non-string and fails date validation.
    await expect(operation).rejects.toMatchObject(validationFailure('rsvpDeadlineAt'));
  });

  it.each(dateFields)('preserves optional PATCH %s null and skips its date validation', async (field) => {
    // Given an explicitly null optional date in a raw PATCH.
    const pipe = createGlobalValidationPipe();
    // When the exact pipe invokes IsOptional before date validation.
    const dto: UpdateScheduleDto = await pipe.transform({ expectedVersion: 0, [field]: null }, { type: 'body', metatype: UpdateScheduleDto });
    // Then null remains available to the service's field-specific semantics.
    expect(dto[field]).toBeNull();
  });

  it('keeps omitted PATCH dates absent while accepting version zero', async () => {
    // Given only the mandatory version field.
    const pipe = createGlobalValidationPipe();
    // When the PATCH body is transformed.
    const dto: UpdateScheduleDto = await pipe.transform({ expectedVersion: 0 }, { type: 'body', metatype: UpdateScheduleDto });
    // Then optional dates stay undefined and version zero is a valid command version.
    expect(dto.expectedVersion).toBe(0);
    for (const field of dateFields) expect(dto[field]).toBeUndefined();
  });

  it.each(['startAt', 'endAt'] as const)('rejects required create %s null', async (field) => {
    // Given a null required create date.
    const pipe = createGlobalValidationPipe();
    // When the create DTO is validated.
    const operation = pipe.transform({ ...createBody, [field]: null }, { type: 'body', metatype: CreateScheduleDto });
    // Then null fails the required date contract.
    await expect(operation).rejects.toMatchObject(validationFailure(field));
  });

  it.each(['startAt', 'endAt'] as const)('rejects omitted required create %s', async (field) => {
    // Given a body genuinely missing the required date property.
    const body = { ...createBody };
    const payload = Object.fromEntries(Object.entries(body).filter(([key]) => key !== field));
    const pipe = createGlobalValidationPipe();
    // When the create DTO is validated.
    const operation = pipe.transform(payload, { type: 'body', metatype: CreateScheduleDto });
    // Then omission has the same actual date validation envelope.
    await expect(operation).rejects.toMatchObject(validationFailure(field));
  });

  it.each([0, '0', 2, '2'])('accepts and converts PATCH expectedVersion %j to an integer', async (expectedVersion) => {
    // Given the actual @Type(Number), IsInt and Min(0) decorators.
    const pipe = createGlobalValidationPipe();
    // When a number or numeric string crosses the HTTP boundary.
    const dto: UpdateScheduleDto = await pipe.transform({ expectedVersion }, { type: 'body', metatype: UpdateScheduleDto });
    // Then numeric strings become numbers and zero remains valid.
    expect(dto.expectedVersion).toBe(Number(expectedVersion));
  });

  it.each([
    { expectedVersion: NaN }, { expectedVersion: 'NaN' },
    { expectedVersion: 1.5 }, { expectedVersion: '1.5' },
    { expectedVersion: -1 }, { expectedVersion: '-1' },
    { expectedVersion: null }, { expectedVersion: ['0'] },
  ])('rejects invalid PATCH expectedVersion %p', async ({ expectedVersion }) => {
    // Given a non-integer, negative, null or array version.
    const pipe = createGlobalValidationPipe();
    // When the actual number transformation and validators run.
    const operation = pipe.transform({ expectedVersion }, { type: 'body', metatype: UpdateScheduleDto });
    // Then the version field owns the HTTP400 validation detail.
    await expect(operation).rejects.toMatchObject(validationFailure('expectedVersion'));
  });

  it('rejects an omitted PATCH expectedVersion', async () => {
    // Given a body with no version field.
    const pipe = createGlobalValidationPipe();
    // When the actual update DTO is validated.
    const operation = pipe.transform({}, { type: 'body', metatype: UpdateScheduleDto });
    // Then missing version is an HTTP400 boundary failure, before service version comparison.
    await expect(operation).rejects.toMatchObject(validationFailure('expectedVersion'));
  });
});
