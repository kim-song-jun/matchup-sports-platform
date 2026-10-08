import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { V1ApiError, v1Get, v1Patch, v1Post } from '@/lib/api-client';
import type {
  V1CreateScheduleDto,
  V1TeamScheduleDetail,
  V1TeamScheduleMutationResult,
  V1UpdateScheduleDto,
} from '@/types/api';
import { v1MswHandlers } from './handlers';

const collectionPath = '/teams/team-1/schedules';
const schedulePath = `${collectionPath}/schedule-1`;
const baseline: V1CreateScheduleDto = {
  title: '주말 정기 훈련',
  type: 'TRAINING',
  startAt: '2026-05-24T09:00:00.000Z',
  endAt: '2026-05-24T11:00:00.000Z',
  timezone: 'Asia/Seoul',
  capacity: 16,
  rsvpDeadlineAt: '2026-05-23T15:00:00.000Z',
  visibility: 'TEAM',
};
const invalidRangeError = {
  statusCode: 422,
  code: 'SCHEDULE_INVALID_TIME_RANGE',
} satisfies Partial<V1ApiError>;
const server = setupServer(
  ...v1MswHandlers,
  // 실제 API 클라이언트의 오류 보고만 수신하고 일정 요청은 기존 핸들러로 검증한다.
  http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })),
);

describe('team schedule MSW date-order API contract', () => {
  beforeEach(async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
    server.listen({ onUnhandledRequest: 'error' });
    await v1Post(collectionPath, baseline);
  });

  afterEach(async () => {
    try {
      await v1Post(collectionPath, baseline);
    } finally {
      server.close();
      vi.unstubAllEnvs();
    }
  });

  it.each([
    { label: 'reversed', endAt: '2026-05-24T08:00:00.000Z' },
    { label: 'equal', endAt: baseline.startAt },
  ])('rejects $label create dates without changing the stored schedule', async ({ endAt }) => {
    // Given: a stored schedule with an increasing range.
    const before = await v1Get<V1TeamScheduleDetail>(schedulePath);
    // When: a create request supplies a non-increasing range.
    const mutation = v1Post(collectionPath, { ...baseline, title: '저장되면 안 되는 일정', endAt });
    // Then: the API rejects it and preserves every detail field, including state/version.
    await expect(mutation).rejects.toMatchObject(invalidRangeError);
    expect(await v1Get<V1TeamScheduleDetail>(schedulePath)).toEqual(before);
  });

  const invalidPatches = [
    { label: 'both dates reversed', changes: { startAt: baseline.endAt, endAt: baseline.startAt } },
    { label: 'both dates equal', changes: { startAt: baseline.startAt, endAt: baseline.startAt } },
    { label: 'start only reversed', changes: { startAt: '2026-05-24T12:00:00.000Z' } },
    { label: 'start only equal', changes: { startAt: baseline.endAt } },
    { label: 'end only reversed', changes: { endAt: '2026-05-24T08:00:00.000Z' } },
    { label: 'end only equal', changes: { endAt: baseline.startAt } },
  ] satisfies readonly {
    readonly label: string;
    readonly changes: Pick<V1UpdateScheduleDto, 'startAt' | 'endAt'>;
  }[];

  it.each(invalidPatches)('rejects $label PATCH dates without changing the stored schedule', async ({ changes }) => {
    // Given: omitted PATCH dates must be combined with the stored range.
    const before = await v1Get<V1TeamScheduleDetail>(schedulePath);
    // When: that effective range is not increasing.
    const mutation = v1Patch(schedulePath, {
      expectedVersion: before.version,
      title: '저장되면 안 되는 수정',
      ...changes,
    } satisfies V1UpdateScheduleDto);
    // Then: date rejection does not mutate either the fixture or its version.
    await expect(mutation).rejects.toMatchObject(invalidRangeError);
    expect(await v1Get<V1TeamScheduleDetail>(schedulePath)).toEqual(before);
  });

  it('persists a valid next-day create range', async () => {
    // Given: a range that crosses midnight.
    const payload = {
      ...baseline,
      startAt: '2026-05-24T23:00:00.000Z',
      endAt: '2026-05-25T01:00:00.000Z',
    } satisfies V1CreateScheduleDto;
    // When: the schedule is created.
    const result = await v1Post<V1TeamScheduleMutationResult>(collectionPath, payload);
    // Then: a fresh GET exposes the accepted dates and initial version.
    expect(result).toMatchObject({ startAt: payload.startAt, endAt: payload.endAt, state: 'SCHEDULED', version: 0 });
    expect(await v1Get<V1TeamScheduleDetail>(schedulePath)).toMatchObject({
      id: result.id,
      title: payload.title,
      startAt: payload.startAt,
      endAt: payload.endAt,
      state: 'SCHEDULED',
      version: 0,
    });
  });

  const validPatches = [
    {
      label: 'next-day range',
      changes: { startAt: '2026-05-24T23:00:00.000Z', endAt: '2026-05-25T01:00:00.000Z' },
      startAt: '2026-05-24T23:00:00.000Z',
      endAt: '2026-05-25T01:00:00.000Z',
    },
    {
      label: 'start only',
      changes: { startAt: '2026-05-24T10:00:00.000Z' },
      startAt: '2026-05-24T10:00:00.000Z',
      endAt: baseline.endAt,
    },
    {
      label: 'end only',
      changes: { endAt: '2026-05-25T01:00:00.000Z' },
      startAt: baseline.startAt,
      endAt: '2026-05-25T01:00:00.000Z',
    },
    { label: 'omitted dates', changes: {}, startAt: baseline.startAt, endAt: baseline.endAt },
  ] satisfies readonly {
    readonly label: string;
    readonly changes: Pick<V1UpdateScheduleDto, 'startAt' | 'endAt'>;
    readonly startAt: string;
    readonly endAt: string;
  }[];

  it.each(validPatches)('persists $label PATCH semantics', async ({ changes, startAt, endAt }) => {
    // Given: the existing schedule has its returned version and a valid range.
    const before = await v1Get<V1TeamScheduleDetail>(schedulePath);
    // When: a current-version update supplies an increasing effective range.
    const result = await v1Patch<V1TeamScheduleMutationResult>(schedulePath, {
      expectedVersion: before.version,
      title: '유효한 수정',
      ...changes,
    } satisfies V1UpdateScheduleDto);
    // Then: a fresh GET preserves omitted dates and exposes exactly one version increment.
    expect(result).toMatchObject({ startAt, endAt, title: '유효한 수정', state: 'SCHEDULED', version: before.version + 1 });
    expect(await v1Get<V1TeamScheduleDetail>(schedulePath)).toEqual({
      ...before,
      title: '유효한 수정',
      startAt,
      endAt,
      version: before.version + 1,
    });
  });

  it('rejects a stale-version invalid range before date validation without mutation', async () => {
    // Given: the submitted version differs from the stored schedule.
    const before = await v1Get<V1TeamScheduleDetail>(schedulePath);
    // When: the stale request also supplies an invalid effective range.
    const mutation = v1Patch(schedulePath, {
      expectedVersion: before.version + 1,
      endAt: baseline.startAt,
      title: '저장되면 안 되는 충돌',
    } satisfies V1UpdateScheduleDto);
    // Then: version precedence matches the service and the schedule remains intact.
    await expect(mutation).rejects.toMatchObject({ statusCode: 409, code: 'VERSION_CONFLICT' });
    expect(await v1Get<V1TeamScheduleDetail>(schedulePath)).toEqual(before);
  });

  it.each(['cancel', 'complete'])('rejects an invalid range on a %s terminal schedule before date validation', async (action) => {
    // Given: the schedule is terminal with its latest version.
    const initial = await v1Get<V1TeamScheduleDetail>(schedulePath);
    await v1Post(`${schedulePath}/${action}`, action === 'cancel'
      ? { expectedVersion: initial.version, cancelReason: '테스트 종료' }
      : { expectedVersion: initial.version });
    const before = await v1Get<V1TeamScheduleDetail>(schedulePath);
    // When: a current-version PATCH also supplies an invalid range.
    const mutation = v1Patch(schedulePath, {
      expectedVersion: before.version,
      endAt: baseline.startAt,
      title: '저장되면 안 되는 종료 일정',
    } satisfies V1UpdateScheduleDto);
    // Then: terminal-state precedence matches the service and preserves every field.
    await expect(mutation).rejects.toMatchObject({ statusCode: 409, code: 'SCHEDULE_TERMINAL' });
    expect(await v1Get<V1TeamScheduleDetail>(schedulePath)).toEqual(before);
  });

  const malformedCreates = ['startAt', 'endAt'].flatMap((field) =>
    ['not-a-date', '05/24/2026 10:00'].map((value) => ({ field, value })),
  );
  it.each(malformedCreates)('rejects malformed create $field=$value at DTO validation', async ({ field, value }) => {
    // Given: a valid stored schedule and a malformed supplied date string.
    const before = await v1Get<V1TeamScheduleDetail>(schedulePath);
    // When: create supplies a timestamp that IsDateString rejects, including Date.parse-compatible syntax.
    const mutation = v1Post(collectionPath, { ...baseline, [field]: value });
    // Then: validation wins before service checks or fixture writes.
    await expect(mutation).rejects.toMatchObject({
      statusCode: 400, code: 'VALIDATION_ERROR', message: '입력값을 다시 확인해 주세요.',
      details: [{ field, messages: [`${field} must be a valid ISO 8601 date string`] }],
    });
    expect(await v1Get<V1TeamScheduleDetail>(schedulePath)).toEqual(before);
  });

  const malformedPatches = ['current', 'stale', 'cancel', 'complete'].flatMap((state) => [
    { state, field: 'startAt', value: 'not-a-date' },
    { state, field: 'endAt', value: '05/24/2026 10:00' },
  ]);
  it.each(malformedPatches)('rejects malformed PATCH $field before $state service checks', async ({ state, field, value }) => {
    // Given: a current, stale or terminal schedule request with malformed supplied input.
    const initial = await v1Get<V1TeamScheduleDetail>(schedulePath);
    if (state === 'cancel' || state === 'complete') {
      await v1Post(`${schedulePath}/${state}`, state === 'cancel'
        ? { expectedVersion: initial.version, cancelReason: '테스트 종료' }
        : { expectedVersion: initial.version });
    }
    const before = await v1Get<V1TeamScheduleDetail>(schedulePath);
    // When: PATCH sends the malformed date, with a stale version where requested.
    const mutation = v1Patch(schedulePath, { expectedVersion: before.version + (state === 'stale' ? 1 : 0), [field]: value });
    // Then: supplied-field DTO validation precedes version, state and effective-range checks.
    await expect(mutation).rejects.toMatchObject({
      statusCode: 400, code: 'VALIDATION_ERROR', message: '입력값을 다시 확인해 주세요.',
      details: [{ field, messages: [`${field} must be a valid ISO 8601 date string`] }],
    });
    expect(await v1Get<V1TeamScheduleDetail>(schedulePath)).toEqual(before);
  });

  it.each(['startAt', 'endAt'])('preserves %s when the optional PATCH date is null', async (field) => {
    // Given: IsOptional skips both null and omitted date fields.
    const before = await v1Get<V1TeamScheduleDetail>(schedulePath);
    // When: a current-version PATCH supplies null for that optional field.
    await v1Patch(schedulePath, { expectedVersion: before.version, [field]: null });
    // Then: the effective date and every other field are preserved except the version increment.
    expect(await v1Get<V1TeamScheduleDetail>(schedulePath)).toEqual({ ...before, version: before.version + 1 });
  });

  it.each(['create', 'patch'])('keeps service422 for a DTO-valid but unparseable ISO week date on %s', async (method) => {
    // Given: IsDateString default options accept ISO week syntax, but Date cannot parse it.
    const before = await v1Get<V1TeamScheduleDetail>(schedulePath);
    // When: valid DTO syntax reaches the effective Date-epoch guard.
    const mutation = method === 'create'
      ? v1Post(collectionPath, { ...baseline, startAt: '2026-W21-7' })
      : v1Patch(schedulePath, { expectedVersion: before.version, startAt: '2026-W21-7' });
    // Then: the service error remains distinct from DTO validation and writes nothing.
    await expect(mutation).rejects.toMatchObject(invalidRangeError);
    expect(await v1Get<V1TeamScheduleDetail>(schedulePath)).toEqual(before);
  });
});
