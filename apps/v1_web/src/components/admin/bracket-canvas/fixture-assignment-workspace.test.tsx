import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useV1AdminBracket } from '@/hooks/use-v1-api';
import { makeBracket, makeFixture, makeGroup } from '@/test/bracket-canvas-fixtures';
import { FixtureAssignmentWorkspace } from './fixture-assignment-workspace';
import { FixtureMetadataEditor } from './fixture-metadata-editor';
import { formatKstDateShort, formatKstTime } from '@/lib/date-utils';
import type { V1AdminBracketFixture, V1TournamentField } from '@/types/api';

const viewport = vi.hoisted(() => ({ wide: true }));
vi.mock('@/hooks/use-media-query', () => ({ useMediaQuery: () => viewport.wide }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ back: vi.fn(), replace: vi.fn() }) }));
vi.mock('@/components/admin/period-override-field', () => ({ PeriodOverrideField: () => null,
  useMatchPeriodOverride: () => ({ payload: null, save: async () => {}, pending: false }) }));
vi.mock('@/components/v1-ui/place-picker', () => ({ PlacePicker: ({ value, onChange }: { value: { name: string } | null; onChange: (value: unknown) => void }) =>
  <input aria-label="장소 직접 입력" value={value?.name ?? ''} onChange={event => onChange({ kind: 'manual', name: event.target.value })} /> }));

const ok = (data: unknown) => HttpResponse.json({ status: 'success', data });
const path = '*/api/v1';
const group = makeGroup({ id: 'g1', name: 'A조', phase: 'group' });
const stamp = '2026-11-21T01:00:00.000Z';
let fixtures: V1AdminBracketFixture[];
let times: { id: string; scheduledAt: string }[];
let fields: V1TournamentField[];
let patches: Record<string, unknown>[];
let fail = false;
const server = setupServer(
  http.post(`${path}/logs/client-error`, () => ok({})),
  http.get(`${path}/admin/tournaments/t-1/bracket`, () => ok(makeBracket({ fixtures, groups: [group] }))),
  http.get(`${path}/admin/tournaments/t-1/schedule-times`, () => ok({ items: times })),
  http.post(`${path}/admin/tournaments/t-1/schedule-times`, async ({ request }) => {
    const input = await request.json() as { scheduledAt: string }; const item = { id: 'new', ...input }; times.push(item); return ok({ item });
  }),
  http.patch(`${path}/admin/tournaments/t-1/schedule-times`, async ({ request }) => {
    const body = await request.json() as { expectedScheduleTimeId: string | null; expectedFixtureIds?: string[]; expectedScheduledAt: string; scheduledAt: string }; patches.push(body);
    if (fail) return HttpResponse.json({ status: 'error', code: 'SCHEDULE_TIME_STALE', message: '시간 항목이 이미 변경됐어요.' }, { status: 409 });
    if (times.some(item => item.scheduledAt === body.scheduledAt)) return HttpResponse.json({ status: 'error', code: 'SCHEDULE_TIME_DUPLICATE', message: '이미 등록되거나 배정된 시간이에요.' }, { status: 409 });
    let item = times.find(row => row.scheduledAt === body.expectedScheduledAt);
    const assigned = fixtures.filter(row => row.scheduledAt === body.expectedScheduledAt);
    if ((item?.id ?? null) !== body.expectedScheduleTimeId || !item && JSON.stringify(assigned.map(row => row.id).sort()) !== JSON.stringify([...(body.expectedFixtureIds ?? [])].sort())) {
      return HttpResponse.json({ status: 'error', code: 'SCHEDULE_TIME_STALE', message: '시간 항목이 이미 변경됐어요.' }, { status: 409 });
    }
    if (!item && assigned.length === 0) return HttpResponse.json({ status: 'error', message: '시간 항목이 이미 변경됐어요.' }, { status: 409 });
    if (!item) { item = { id: 'legacy', scheduledAt: body.scheduledAt }; times.push(item); }
    item.scheduledAt = body.scheduledAt; assigned.forEach(row => { row.scheduledAt = body.scheduledAt; });
    return ok({ item, affectedFixtureCount: assigned.length });
  }),
  http.get(`${path}/tournament-ops/tournaments/t-1/fields`, () => ok({ items: fields })),
  http.post(`${path}/tournament-ops/tournaments/t-1/fields`, async ({ request }) => {
    const input = await request.json() as { name: string; scopeKey: string }; const item = { id: 'new-field', tournamentId: 't-1', active: true, version: 0, sortOrder: 0, ...input }; fields.push(item); return ok(item);
  }),
  http.patch(`${path}/tournament-ops/tournaments/t-1/fields/:fieldId`, async ({ params, request }) => {
    const body = await request.json() as { expectedVersion: number; name: string; syncAssignedFixtures: boolean }; patches.push(body);
    const field = fields.find(item => item.id === params.fieldId)!;
    if (fail || field.version !== body.expectedVersion) return HttpResponse.json({ status: 'error', code: 'STALE_FIELD_VERSION', message: '구장 정보가 이미 변경됐어요.' }, { status: 409 });
    if (fields.some(item => item.id !== field.id && item.name.toLowerCase() === body.name.trim().toLowerCase())) return HttpResponse.json({ status: 'error', code: 'FIELD_NAME_DUPLICATE', message: '이미 같은 이름의 경기장이 있어요.' }, { status: 409 });
    field.name = body.name.trim(); field.version += 1;
    if (body.syncAssignedFixtures) fixtures.filter(item => item.fieldId === field.id).forEach(item => { item.venue = field.name; });
    return ok(field);
  }),
  http.patch(`${path}/admin/fixtures/:id`, async ({ request, params }) => {
    const body = await request.json() as Record<string, unknown>; patches.push(body);
    if (fail) return HttpResponse.json({ status: 'error', statusCode: 409, code: 'SCHEDULE_CONFLICT', message: '일정을 다시 확인해 주세요.' }, { status: 409 });
    const fixture = fixtures.find(f => f.id === params.id)!; Object.assign(fixture, body);
    if (typeof body.fieldId === 'string') fixture.venue = fields.find(f => f.id === body.fieldId)!.name;
    if (body.venue === '') fixture.venue = null;
    return ok({ ...fixture, startedTeamChange: null });
  }),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => { cleanup(); server.resetHandlers(); });
beforeEach(() => {
  viewport.wide = true; fail = false; patches = []; times = [{ id: 'time1', scheduledAt: stamp }, { id: 'time2', scheduledAt: '2026-11-21T01:30:00.000Z' }];
  fields = [{ id: 'field-a', tournamentId: 't-1', name: 'A구장', active: true, version: 0, sortOrder: 0, scopeKey: 'a' }, { id: 'field-b', tournamentId: 't-1', name: 'B구장', active: true, version: 0, sortOrder: 1, scopeKey: 'b' }];
  fixtures = [makeFixture({ id: 'f1', fixtureNumber: 1, groupId: 'g1', homeTeamName: '서울', awayTeamName: '부산', homeRegistrationId: 'r1', awayRegistrationId: 'r2', scheduledAt: stamp, fieldId: 'field-a', venue: 'A구장' }),
    makeFixture({ id: 'f2', fixtureNumber: 2, groupId: 'g1' })];
});
function CurrentFixture() {
  const query = useV1AdminBracket('t-1');
  return query.data ? <FixtureMetadataEditor tournamentId="t-1" fixture={query.data.fixtures[0]} groups={query.data.groups} fixtures={query.data.fixtures} slots={[]} canWrite /> : null;
}
function show(canWrite = true, canManageFields = true, editor = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><FixtureAssignmentWorkspace tournamentId="t-1" canWrite={canWrite} canManageFields={canManageFields} showToast={vi.fn()}>
    {editor ? <CurrentFixture /> : <p>대진표</p>}
  </FixtureAssignmentWorkspace></QueryClientProvider>);
  return client;
}
const timeLabel = (stamp: string) => `${formatKstDateShort(stamp)} ${formatKstTime(stamp)}`;

describe('registered assignment option editing', () => {
  it('keeps a local draft visible when a different operator replaces its time during a real refetch', async () => {
    const client = show(); fireEvent.click(screen.getByRole('button', { name: '시간 배정' }));
    fireEvent.click(await screen.findByRole('button', { name: `${timeLabel(stamp)} 시간 수정` }));
    fireEvent.change(screen.getByLabelText('시간 수정 (한국 시간)'), { target: { value: '2026-11-21T11:00' } });
    times[0].scheduledAt = '2026-11-21T02:30:00.000Z'; fixtures[0].scheduledAt = times[0].scheduledAt;
    await act(async () => { await client.refetchQueries(); });
    expect(await screen.findByRole('alert')).toHaveTextContent('수정 중이던 항목을 최신 목록에서 확인할 수 없어요');
    expect(screen.getByLabelText('시간 수정 (한국 시간)')).toHaveValue('2026-11-21T11:00');
    expect(screen.getByLabelText('시간 수정 (한국 시간)')).toHaveAttribute('readonly');
    expect(screen.queryByRole('button', { name: '저장' })).not.toBeInTheDocument();
    expect(patches).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(screen.getByRole('region', { name: '시간 배정' })).toHaveFocus();
  });
  it('does not round an existing instant merely by opening and saving the minute-resolution editor', async () => {
    const precise = '2026-11-21T01:00:30.123Z'; times[0].scheduledAt = precise; fixtures[0].scheduledAt = precise;
    show(); fireEvent.click(screen.getByRole('button', { name: '시간 배정' }));
    fireEvent.click(await screen.findByRole('button', { name: `${timeLabel(precise)} 시간 수정` }));
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(patches).toEqual([]); expect(times[0].scheduledAt).toBe(precise); expect(fixtures[0].scheduledAt).toBe(precise);
  });
  it('moves a time item and assigned games using the expected old instant, preserving the court', async () => {
    show(); fireEvent.click(screen.getByRole('button', { name: '시간 배정' }));
    fireEvent.click(await screen.findByRole('button', { name: `${timeLabel(stamp)} 시간 수정` }));
    const input = screen.getByLabelText('시간 수정 (한국 시간)');
    expect(input).toHaveValue('2026-11-21T10:00');
    expect(screen.getByText('이 항목에 배정된 1경기의 시간도 함께 바뀌어요.')).toBeInTheDocument();
    fireEvent.change(input, { target: { value: '2026-11-21T11:00' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await screen.findByRole('button', { name: `${timeLabel('2026-11-21T02:00:00Z')} 시간 수정` });
    expect(patches).toContainEqual({ expectedScheduleTimeId: 'time1', expectedScheduledAt: stamp, scheduledAt: '2026-11-21T02:00:00.000Z' });
    expect(times[0]).toEqual({ id: 'time1', scheduledAt: '2026-11-21T02:00:00.000Z' });
    expect(fixtures[0]).toMatchObject({ scheduledAt: '2026-11-21T02:00:00.000Z', fieldId: 'field-a', venue: 'A구장' });
  });

  it('renames an unused choice and lets cancellation leave the server untouched', async () => {
    show(); fireEvent.click(screen.getByRole('button', { name: '시간 배정' }));
    fireEvent.click(await screen.findByRole('button', { name: `${timeLabel(times[1].scheduledAt)} 시간 수정` }));
    expect(screen.getByText('이 항목에 배정된 0경기의 시간도 함께 바뀌어요.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('시간 수정 (한국 시간)'), { target: { value: '2026-11-21T12:00' } });
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(patches).toEqual([]);
    expect(times[1].scheduledAt).toBe('2026-11-21T01:30:00.000Z');
    fireEvent.click(screen.getByRole('button', { name: `${timeLabel(times[1].scheduledAt)} 시간 수정` }));
    fireEvent.change(screen.getByLabelText('시간 수정 (한국 시간)'), { target: { value: '2026-11-21T12:00' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(times[1].scheduledAt).toBe('2026-11-21T03:00:00.000Z'));
    expect(fixtures[0].scheduledAt).toBe(stamp);
  });

  it.each(['stale', 'duplicate'])('keeps the draft and all old assignments after a %s response', async kind => {
    fail = kind === 'stale'; show(); fireEvent.click(screen.getByRole('button', { name: '시간 배정' }));
    fireEvent.click(await screen.findByRole('button', { name: `${timeLabel(stamp)} 시간 수정` }));
    const draft = kind === 'duplicate' ? '2026-11-21T10:30' : '2026-11-21T11:00';
    fireEvent.change(screen.getByLabelText('시간 수정 (한국 시간)'), { target: { value: draft } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(kind === 'duplicate' ? '이미 등록되거나 배정된 시간이에요.' : '시간 항목이 이미 변경됐어요.');
    expect(screen.getByLabelText('시간 수정 (한국 시간)')).toHaveValue(draft);
    expect(fixtures[0].scheduledAt).toBe(stamp); expect(times[0].scheduledAt).toBe(stamp);
  });

  it('renames a registered court and its match labels, preserving stable identity and kickoff', async () => {
    show(); fireEvent.click(screen.getByRole('button', { name: '구장 배정' }));
    fireEvent.click(await screen.findByRole('button', { name: 'A구장 이름 수정' }));
    fireEvent.change(screen.getByLabelText('구장 이름 수정'), { target: { value: ' 메인 구장 ' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await screen.findByRole('button', { name: '메인 구장 이름 수정' });
    expect(patches).toContainEqual({ name: '메인 구장', expectedVersion: 0, syncAssignedFixtures: true });
    expect(fixtures[0]).toMatchObject({ fieldId: 'field-a', venue: '메인 구장', scheduledAt: stamp });
    expect(fields[0]).toMatchObject({ id: 'field-a', version: 1 });
  });

  it('submits the version captured when editing began and preserves the draft on a real stale response', async () => {
    show(); fireEvent.click(screen.getByRole('button', { name: '구장 배정' }));
    fireEvent.click(await screen.findByRole('button', { name: 'A구장 이름 수정' }));
    fields[0].version = 1;
    fireEvent.change(screen.getByLabelText('구장 이름 수정'), { target: { value: '수정 중 구장' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('구장 정보가 이미 변경됐어요.');
    expect(screen.getByLabelText('구장 이름 수정')).toHaveValue('수정 중 구장');
    expect(fields[0].name).toBe('A구장'); expect(fixtures[0].venue).toBe('A구장');
  });

  it('separates editing from collapse, supports Escape and retains field-management permissions', async () => {
    show(true, false); fireEvent.click(screen.getByRole('button', { name: '시간 배정' }));
    const summary = (await screen.findByText(timeLabel(stamp), { selector: 'summary > span' })).closest('summary')!;
    fireEvent.click(summary);
    expect(summary.parentElement).not.toHaveAttribute('open');
    fireEvent.click(screen.getByRole('button', { name: `${timeLabel(stamp)} 시간 수정` }));
    expect(summary.parentElement).toHaveAttribute('open');
    expect(screen.getByLabelText('시간 수정 (한국 시간)')).toHaveFocus();
    fireEvent.change(screen.getByLabelText('시간 수정 (한국 시간)'), { target: { value: '2026-11-21T11:45' } });
    fireEvent.click(summary);
    expect(summary.parentElement).not.toHaveAttribute('open');
    fireEvent.click(screen.getByRole('button', { name: `${timeLabel(stamp)} 시간 수정` }));
    expect(summary.parentElement).toHaveAttribute('open');
    expect(screen.getByLabelText('시간 수정 (한국 시간)')).toHaveValue('2026-11-21T11:45');
    expect(screen.getByLabelText('시간 수정 (한국 시간)')).toHaveFocus();
    fireEvent.keyDown(screen.getByLabelText('시간 수정 (한국 시간)'), { key: 'Escape' });
    expect(screen.queryByLabelText('시간 수정 (한국 시간)')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '구장 배정' }));
    await screen.findByText('구장 등록은 플랫폼 운영자가 할 수 있어요. 등록된 구장은 배정할 수 있어요.');
    expect(screen.queryByRole('button', { name: /이름 수정$/ })).not.toBeInTheDocument();
    cleanup(); show(false, false); fireEvent.click(screen.getByRole('button', { name: '시간 배정' }));
    await screen.findByText(timeLabel(stamp), { selector: 'summary > span' });
    expect(screen.queryByRole('button', { name: /시간 수정$/ })).not.toBeInTheDocument();
  });
});

describe('real fixture assignment API and shared editor', () => {
  it('leaves mobile panel content gestures to scrolling and summary controls', async () => {
    viewport.wide = false;
    const originalCapture = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'setPointerCapture');
    const capture = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', { configurable: true, value: capture });
    try {
      show();
      fireEvent.click(screen.getByRole('button', { name: '시간 배정' }));
      const summary = (await screen.findByText(timeLabel(stamp), { selector: 'summary > span' })).closest('summary')!;
      fireEvent.pointerDown(summary);
      expect(capture).not.toHaveBeenCalled();
      fireEvent.click(summary);
      expect(summary.parentElement).not.toHaveAttribute('open');
      expect(screen.getByRole('dialog', { name: '시간 배정' })).toBeInTheDocument();
    } finally {
      if (originalCapture) Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', originalCapture);
      else delete (HTMLElement.prototype as Partial<HTMLElement>).setPointerCapture;
    }
  });
  it('changes time and court independently, rehydrates the existing manual editor, and keeps collapsed sections', async () => {
    show(true, true, true);
    expect(await screen.findByLabelText('경기 시각')).toHaveValue('2026-11-21T10:00');
    fireEvent.click(screen.getByRole('button', { name: '시간 배정' }));
    const selection = await screen.findByLabelText(`${timeLabel(times[1].scheduledAt)}에 경기 배정`);
    fireEvent.change(selection, { target: { value: 'f1' } });
    await waitFor(() => expect(screen.getByLabelText('경기 시각')).toHaveValue('2026-11-21T10:30'));
    expect(patches[0]).toEqual({ scheduledAt: times[1].scheduledAt });
    expect(fixtures[0].fieldId).toBe('field-a');
    const summary = screen.getByText(timeLabel(stamp), { selector: 'summary > span' }).closest('summary')!;
    fireEvent.click(summary);
    expect(summary.parentElement).not.toHaveAttribute('open');
    fireEvent.click(screen.getByRole('button', { name: '구장 배정' }));
    fireEvent.change(await screen.findByLabelText('B구장에 경기 배정'), { target: { value: 'f1' } });
    await waitFor(() => expect(screen.getByLabelText('등록된 경기장(필드)')).toHaveValue('field-b'));
    expect(patches[1]).toEqual({ fieldId: 'field-b' });
    expect(fixtures[0].scheduledAt).toBe(times[1].scheduledAt);
    fireEvent.click(screen.getByRole('button', { name: '시간 배정' }));
    expect(screen.getByText(timeLabel(stamp), { selector: 'summary > span' }).closest('details')).not.toHaveAttribute('open');
    fireEvent.change(screen.getByLabelText('경기 시각'), { target: { value: '2026-11-21T10:45' } });
    fireEvent.click(screen.getByRole('button', { name: '경기 정보 저장' }));
    await screen.findByLabelText(`${timeLabel('2026-11-21T01:45:00Z')}에 경기 배정`);
    expect(patches[2]).toEqual({ scheduledAt: '2026-11-21T01:45:00.000Z' });
  });
  it('clears only the selected field and preserves the counterpart', async () => {
    show(); fireEvent.click(screen.getByRole('button', { name: '시간 배정' }));
    fireEvent.click(await screen.findByRole('button', { name: '서울 vs 부산 시간 해제' }));
    await waitFor(() => expect(fixtures[0].scheduledAt).toBeNull());
    await waitFor(() => expect(screen.getByRole('button', { name: '구장 배정' })).toBeEnabled());
    expect(fixtures[0].fieldId).toBe('field-a');
    fireEvent.click(screen.getByRole('button', { name: '구장 배정' }));
    fireEvent.click(await screen.findByRole('button', { name: '서울 vs 부산 구장 해제' }));
    await waitFor(() => expect(fixtures[0].fieldId).toBeNull());
    expect(patches).toEqual([{ scheduledAt: null }, { fieldId: null, venue: '' }]);
  });
  it('surfaces a failed save and does not move the game', async () => {
    fail = true; show(); fireEvent.click(screen.getByRole('button', { name: '시간 배정' }));
    fireEvent.change(await screen.findByLabelText(`${timeLabel(times[1].scheduledAt)}에 경기 배정`), { target: { value: 'f1' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('일정을 다시 확인해 주세요');
    expect(fixtures[0].scheduledAt).toBe(stamp);
  });
  it('persists unused time and court choices and exposes read-only controls correctly', async () => {
    show(); fireEvent.click(screen.getByRole('button', { name: '시간 배정' }));
    const input = await screen.findByLabelText('시간 추가 (한국 시간)');
    await waitFor(() => expect(input).toBeEnabled());
    fireEvent.change(input, { target: { value: '2026-11-21T12:00' } }); fireEvent.click(screen.getByRole('button', { name: '추가' }));
    await screen.findByLabelText(`${timeLabel('2026-11-21T03:00:00Z')}에 경기 배정`);
    expect(times).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: '구장 배정' }));
    fireEvent.change(await screen.findByLabelText('구장 추가'), { target: { value: 'C구장' } }); fireEvent.click(screen.getByRole('button', { name: '추가' }));
    await screen.findByLabelText('C구장에 경기 배정'); expect(fields).toHaveLength(3);
    cleanup(); show(false, false); fireEvent.click(screen.getByRole('button', { name: '시간 배정' }));
    await screen.findByText(timeLabel(stamp));
    expect(screen.queryByRole('button', { name: '추가' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(`${timeLabel(stamp)}에 경기 배정`)).not.toBeInTheDocument();
  });
});
