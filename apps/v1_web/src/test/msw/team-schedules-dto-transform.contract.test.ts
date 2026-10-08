import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { v1Get, v1Patch, v1Post } from '@/lib/api-client';
import type { V1CreateScheduleDto, V1TeamScheduleDetail, V1TeamScheduleMutationResult } from '@/types/api';
import { v1MswHandlers } from './handlers';

const collectionPath = '/teams/team-1/schedules';
const schedulePath = `${collectionPath}/schedule-1`;
const baseline: V1CreateScheduleDto = {
  title: '주말 정기 훈련', type: 'TRAINING', timezone: 'Asia/Seoul',
  startAt: '2026-05-24T09:00:00.000Z', endAt: '2026-05-24T11:00:00.000Z',
  capacity: 16, rsvpDeadlineAt: '2026-05-23T15:00:00.000Z', visibility: 'TEAM',
};
const server = setupServer(
  ...v1MswHandlers,
  http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })),
);

describe('team schedule MSW DTO transformation contract', () => {
  beforeEach(async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
    server.listen({ onUnhandledRequest: 'error' });
    await v1Post(collectionPath, baseline);
  });
  afterEach(async () => {
    try { await v1Post(collectionPath, baseline); }
    finally { server.close(); vi.unstubAllEnvs(); }
  });

  const numericDates = ['create', 'patch'].flatMap((method) => [
    { method, field: 'startAt', value: 2026, serialized: '2026-01-01T00:00:00.000Z' },
    { method, field: 'endAt', value: 2027, serialized: '2027-01-01T00:00:00.000Z' },
  ]);
  it.each(numericDates)('converts numeric $field through String then Date on $method', async ({ method, field, value, serialized }) => {
    // Given: emitted String metadata and enableImplicitConversion accept ISO year-only numeric input.
    const before = await v1Get<V1TeamScheduleDetail>(schedulePath);
    // When: a raw numeric date reaches the actual HTTP handler.
    const result = method === 'create'
      ? await v1Post<V1TeamScheduleMutationResult>(collectionPath, { ...baseline, [field]: value })
      : await v1Patch<V1TeamScheduleMutationResult>(schedulePath, { expectedVersion: before.version, [field]: value });
    // Then: transformed strings feed the range guard and serialize as the service's Date values.
    expect(result).toMatchObject({ [field]: serialized, version: method === 'create' ? 0 : before.version + 1 });
    expect(await v1Get<V1TeamScheduleDetail>(schedulePath)).toMatchObject({ [field]: serialized, version: result.version });
  });

  it.each([
    { method: 'create', value: '2026-05-24', serialized: '2026-05-24T00:00:00.000Z' },
    { method: 'patch', value: '2026-05-24T18:30:00+09:00', serialized: '2026-05-24T09:30:00.000Z' },
  ])('serializes a DTO-valid $method date as the service UTC Date', async ({ method, value, serialized }) => {
    // Given: valid date-only or offset syntax survives IsDateString.
    const before = await v1Get<V1TeamScheduleDetail>(schedulePath);
    // When: the input reaches the service's Date conversion.
    const result = method === 'create'
      ? await v1Post<V1TeamScheduleMutationResult>(collectionPath, { ...baseline, startAt: value })
      : await v1Patch<V1TeamScheduleMutationResult>(schedulePath, { expectedVersion: before.version, startAt: value });
    // Then: create/PATCH and fresh GET return canonical ISO timestamps rather than the raw input.
    expect(result.startAt).toBe(serialized);
    expect((await v1Get<V1TeamScheduleDetail>(schedulePath)).startAt).toBe(serialized);
  });

  it.each(['0', '0.0', '', false])('converts scalar expectedVersion=%s through Number before CAS', async (expectedVersion) => {
    // Given: a newly created schedule has version 0.
    const before = await v1Get<V1TeamScheduleDetail>(schedulePath);
    // When: @Type(Number)-compatible scalar input represents that same version.
    const result = await v1Patch<V1TeamScheduleMutationResult>(schedulePath, { expectedVersion, title: '변환된 버전 수정' });
    // Then: the write succeeds and increments the stored version exactly once.
    expect(result).toMatchObject({ title: '변환된 버전 수정', version: before.version + 1 });
    expect(await v1Get<V1TeamScheduleDetail>(schedulePath)).toEqual({ ...before, title: '변환된 버전 수정', version: before.version + 1 });
  });

  const invalidVersions = [
    { label: 'omitted', value: undefined }, { label: 'null', value: null },
    { label: 'non-numeric string', value: 'not-a-number' }, { label: 'infinite string', value: 'Infinity' },
    { label: 'negative number', value: -1 }, { label: 'negative string', value: '-1' },
    { label: 'fractional number', value: 0.5 }, { label: 'fractional string', value: '0.5' },
    { label: 'empty array', value: [] }, { label: 'numeric array', value: [0] }, { label: 'object', value: {} },
  ];
  it.each(invalidVersions)('rejects $label expectedVersion at DTO validation without mutation', async ({ value }) => {
    // Given: the stored fixture is valid and @Type(Number) preserves arrays/null rather than scalar-coercing them.
    const before = await v1Get<V1TeamScheduleDetail>(schedulePath);
    // When: the required version fails IsInt/Min(0) after transformation.
    const mutation = v1Patch(schedulePath, { expectedVersion: value, title: '저장되면 안 되는 버전' });
    // Then: ValidationPipe400 precedes CAS and leaves every fixture field untouched.
    await expect(mutation).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
    expect(await v1Get<V1TeamScheduleDetail>(schedulePath)).toEqual(before);
  });

  it('reports the transformed numeric stale version in CAS details', async () => {
    // Given: the caller supplies a valid numeric string that differs from the stored version.
    const before = await v1Get<V1TeamScheduleDetail>(schedulePath);
    // When: the transformed version reaches the service CAS gate.
    const mutation = v1Patch(schedulePath, { expectedVersion: String(before.version + 1) });
    // Then: the conflict contains DTO-transformed numbers and preserves the stored schedule.
    await expect(mutation).rejects.toMatchObject({
      statusCode: 409, code: 'VERSION_CONFLICT',
      details: { expectedVersion: before.version + 1, currentVersion: before.version },
    });
    expect(await v1Get<V1TeamScheduleDetail>(schedulePath)).toEqual(before);
  });

  const invalidDateTypes = ['startAt', 'endAt'].flatMap((field) => [
    { field, label: 'ISO numeric array', value: [2026] },
    { field, label: 'object', value: {} },
    { field, label: 'boolean', value: true },
  ]);
  it.each(invalidDateTypes)('rejects $label $field on create without scalar-coercing arrays', async ({ field, value }) => {
    // Given: transform preserves array containers, and other malformed inputs do not become ISO strings.
    const before = await v1Get<V1TeamScheduleDetail>(schedulePath);
    // When: the required create date has that raw input shape.
    const mutation = v1Post(collectionPath, { ...baseline, [field]: value });
    // Then: DTO validation rejects it before the range guard or any fixture mutation.
    await expect(mutation).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
    expect(await v1Get<V1TeamScheduleDetail>(schedulePath)).toEqual(before);
  });

  it.each(['startAt', 'endAt'])('rejects required create %s=null while PATCH null remains optional', async (field) => {
    // Given: create dates have IsDateString without IsOptional.
    const before = await v1Get<V1TeamScheduleDetail>(schedulePath);
    // When: the required field is explicitly null.
    const mutation = v1Post(collectionPath, { ...baseline, [field]: null });
    // Then: null remains null after transform and fails required date validation.
    await expect(mutation).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
    expect(await v1Get<V1TeamScheduleDetail>(schedulePath)).toEqual(before);
  });

  it.each(invalidDateTypes)('rejects $label $field on PATCH without mutation', async ({ field, value }) => {
    // Given: IsOptional skips null/omit, but array/object/boolean inputs still require ISO strings.
    const before = await v1Get<V1TeamScheduleDetail>(schedulePath);
    // When: a current-version PATCH supplies the malformed date input.
    const mutation = v1Patch(schedulePath, { expectedVersion: before.version, [field]: value });
    // Then: DTO validation precedes service gates and preserves every fixture field/version.
    await expect(mutation).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
    expect(await v1Get<V1TeamScheduleDetail>(schedulePath)).toEqual(before);
  });
});
