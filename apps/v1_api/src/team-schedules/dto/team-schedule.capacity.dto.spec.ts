import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateScheduleDto, UpdateScheduleDto } from './team-schedule.dto';

async function validateUpdate(payload: object) {
  const dto = plainToInstance(UpdateScheduleDto, payload, { enableImplicitConversion: true });
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return { dto, errors };
}

describe('UpdateScheduleDto capacity', () => {
  it('preserves explicit null as the clear signal when capacity is removed', async () => {
    // Given
    const payload = { expectedVersion: 0, capacity: null } satisfies UpdateScheduleDto;

    // When
    const { dto, errors } = await validateUpdate(payload);

    // Then
    expect(errors).toHaveLength(0);
    expect(dto.capacity).toBeNull();
  });

  it('preserves undefined as the keep signal when capacity is omitted', async () => {
    // Given
    const payload = { expectedVersion: 0 };

    // When
    const { dto, errors } = await validateUpdate(payload);

    // Then
    expect(errors).toHaveLength(0);
    expect(dto.capacity).toBeUndefined();
  });

  it.each([1, 18])('accepts the positive integer %s when setting capacity', async (capacity) => {
    // Given
    const payload = { expectedVersion: 0, capacity };

    // When
    const { dto, errors } = await validateUpdate(payload);

    // Then
    expect(errors).toHaveLength(0);
    expect(dto.capacity).toBe(capacity);
  });

  it('retains numeric conversion when capacity is a numeric string', async () => {
    // Given
    const payload = { expectedVersion: 0, capacity: '18' };

    // When
    const { dto, errors } = await validateUpdate(payload);

    // Then
    expect(errors).toHaveLength(0);
    expect(dto.capacity).toBe(18);
  });

  it.each([0, -1, 1.5, '', 'many'])('rejects invalid capacity %j when supplied', async (capacity) => {
    // Given
    const payload = { expectedVersion: 0, capacity };

    // When
    const { errors } = await validateUpdate(payload);

    // Then
    expect(errors).toEqual(expect.arrayContaining([expect.objectContaining({ property: 'capacity' })]));
  });
});

describe('CreateScheduleDto capacity', () => {
  it('keeps capacity optional when creating a schedule without a cap', async () => {
    // Given
    const payload = {
      title: 'Team training',
      type: 'TRAINING',
      startAt: '2026-10-08T10:00:00.000Z',
      endAt: '2026-10-08T11:00:00.000Z',
      timezone: 'Asia/Seoul',
    };

    // When
    const dto = plainToInstance(CreateScheduleDto, payload, { enableImplicitConversion: true });
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });

    // Then
    expect(errors).toHaveLength(0);
    expect(dto.capacity).toBeUndefined();
  });
});
