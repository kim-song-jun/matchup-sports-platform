import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import LeagueSettingsClient from './league-settings-client';

const mocks = vi.hoisted(() => ({ canWrite: true }));
vi.mock('@/hooks/use-admin-can-write', () => ({ useAdminCanWrite: () => mocks.canWrite }));
vi.mock('@/hooks/use-v1-api', () => ({ useV1MasterRegions: () => ({ data: [], isError: false }) }));
const initial = { leagueId: 'league-test', title: '기존 리그', rulesText: '운영 안내', regionId: 'region-test',
  startsOn: '2097-12-31T15:00:00.123Z', endsOn: '2098-12-31T14:59:59.999Z',
  registrationDeadlineAt: '2098-01-01T03:12:34.567Z', plannedFixtureCount: 12,
  updatedAt: '2026-10-13T00:00:00.123Z', status: 'draft', sportName: '풋살' };
const path = '*/api/v1/admin/league-matches/league-test/settings';
let stored = { ...initial };
let submitted: Record<string, unknown> | undefined;
const success = (data: unknown) => HttpResponse.json({ status: 'success', data, timestamp: new Date().toISOString() });
const server = setupServer(
  http.post('*/api/v1/logs/client-error', () => HttpResponse.json({ status: 'success' })),
  http.get(path, () => success(stored)),
  http.patch(path, async ({ request }) => { submitted = await request.json() as Record<string, unknown>; stored = { ...stored, ...submitted, updatedAt: '2026-10-13T01:00:00.000Z' }; return success(stored); }),
);
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><LeagueSettingsClient leagueId="league-test" /></QueryClientProvider>);
}
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => { cleanup(); server.resetHandlers(); });
beforeEach(() => { stored = { ...initial }; submitted = undefined; mocks.canWrite = true; });

describe('실제 설정 hook/API를 통한 별도 리그 수정 화면', () => {
  it('현재 값을 채우고 PATCH 저장 후 같은 화면에 남아 알리며 변경하지 않은 시각은 그대로 보낸다', async () => {
    mount();
    const title = await screen.findByLabelText('리그 이름');
    expect(title).toHaveValue(initial.title);
    expect(screen.getByLabelText('시작일')).toHaveValue('2098-01-01');
    expect(screen.getByLabelText('신청 마감 (한국 시간)')).toHaveValue('2098-01-01T12:12');
    expect(screen.getByLabelText('총 경기 수 (선택)')).toHaveValue(12);
    fireEvent.change(title, { target: { value: '변경 리그' } });
    fireEvent.click(screen.getByRole('button', { name: '변경사항 저장' }));
    expect(await screen.findByText('리그 정보를 저장했어요.')).toBeInTheDocument();
    expect(screen.getByLabelText('리그 이름')).toHaveValue('변경 리그');
    expect(screen.getByRole('button', { name: '변경사항 저장' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: '상세로 돌아가기' })).toBeNull();
    expect(submitted).toEqual({ title: '변경 리그', rulesText: initial.rulesText, regionId: initial.regionId,
      startsOn: initial.startsOn, endsOn: initial.endsOn, registrationDeadlineAt: initial.registrationDeadlineAt,
      plannedFixtureCount: 12, expectedUpdatedAt: initial.updatedAt });
    expect(stored.title).toBe('변경 리그');
  });
  it('생성과 같은 기본 입력 순서와 날짜 검증을 제공한다', async () => {
    mount(); await screen.findByLabelText('리그 이름');
    const basic = screen.getByRole('group', { name: '기본 정보' });
    expect(within(basic).getByLabelText('종목')).toBeDisabled();
    expect(within(basic).getByLabelText('종목')).toHaveDisplayValue('풋살');
    expect(Array.from(basic.querySelectorAll('label')).map(label => label.textContent)).toEqual(['리그 이름', '종목', '지역', '시작일', '종료일']);
    fireEvent.change(screen.getByLabelText('종료일'), { target: { value: '2097-01-01' } });
    expect(screen.getByRole('alert')).toHaveTextContent('종료일은 시작일보다 빠를 수 없어요.');
    expect(screen.getByRole('button', { name: '변경사항 저장' })).toBeDisabled();
    expect(submitted).toBeUndefined();
  });
  it('총 경기 수를 변경할 수 있다', async () => {
    mount(); await screen.findByLabelText('리그 이름');
    fireEvent.change(screen.getByLabelText('총 경기 수 (선택)'), { target: { value: '24' } });
    fireEvent.click(screen.getByRole('button', { name: '변경사항 저장' }));
    await waitFor(() => expect(submitted).toMatchObject({ plannedFixtureCount: 24 }));
    expect(stored.plannedFixtureCount).toBe(24);
  });
  it('총 경기 수 범위를 벗어나면 저장하지 않는다', async () => {
    mount(); await screen.findByLabelText('리그 이름');
    fireEvent.change(screen.getByLabelText('총 경기 수 (선택)'), { target: { value: '501' } });
    expect(screen.getByText('총 경기 수는 1~500 사이로 입력해 주세요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '변경사항 저장' })).toBeDisabled();
    expect(submitted).toBeUndefined();
  });
  it('변경한 날짜는 한국 시간으로 저장하고 마감을 비우면 null을 전송한다', async () => {
    mount(); await screen.findByLabelText('리그 이름');
    fireEvent.change(screen.getByLabelText('시작일'), { target: { value: '2098-02-01' } });
    fireEvent.change(screen.getByLabelText('종료일'), { target: { value: '2099-01-01' } });
    fireEvent.change(screen.getByLabelText('신청 마감 (한국 시간)'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('총 경기 수 (선택)'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '변경사항 저장' }));
    await waitFor(() => expect(submitted).toBeDefined());
    expect(submitted).toMatchObject({ startsOn: '2098-01-31T15:00:00.000Z', endsOn: '2099-01-01T14:59:59.999Z', registrationDeadlineAt: null, plannedFixtureCount: null });
  });
  it('409와 재조회 실패에도 초안을 보존하고 명시적으로 확인한 재조회만 초안을 바꾼다', async () => {
    server.use(http.patch(path, () => HttpResponse.json({ statusCode: 409, code: 'LEAGUE_SETTINGS_STALE', message: '최신 정보를 다시 불러와 주세요.' }, { status: 409 })));
    mount(); const title = await screen.findByLabelText('리그 이름');
    fireEvent.change(title, { target: { value: '보존할 초안' } });
    fireEvent.click(screen.getByRole('button', { name: '변경사항 저장' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('최신 정보를 다시 불러와 주세요.');
    expect(title).toHaveValue('보존할 초안');
    server.use(http.get(path, () => HttpResponse.json({ statusCode: 503, message: '조회 실패' }, { status: 503 })));
    fireEvent.click(screen.getByRole('button', { name: '최신 정보 다시 불러오기' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '수정 내용 버리기' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('조회 실패'));
    expect(screen.getByLabelText('리그 이름')).toHaveValue('보존할 초안');
    server.use(http.get(path, () => success({ ...initial, title: '최신 리그' })));
    fireEvent.click(screen.getByRole('button', { name: '최신 정보 다시 불러오기' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '수정 내용 버리기' }));
    await waitFor(() => expect(screen.getByLabelText('리그 이름')).toHaveValue('최신 리그'));
  });
  it('최초 조회 실패는 재시도로 복구하며 다른 리그를 대신 보여주지 않는다', async () => {
    server.use(http.get(path, () => HttpResponse.json({ statusCode: 503, code: 'UNAVAILABLE', message: '리그 조회 실패' }, { status: 503 })));
    mount();
    expect(await screen.findByText('리그 정보를 불러오지 못했어요')).toBeInTheDocument();
    expect(screen.queryByLabelText('리그 이름')).toBeNull();
    server.use(http.get(path, () => success(initial)));
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(await screen.findByLabelText('리그 이름')).toHaveValue(initial.title);
  });
  it('종료된 리그는 쓰기 권한이 있어도 수정할 수 없다', async () => {
    stored = { ...initial, status: 'completed' }; mount();
    expect(await screen.findByLabelText('리그 이름')).toBeDisabled();
    expect(screen.getByRole('button', { name: '변경사항 저장' })).toBeDisabled();
  });
  it('읽기 전용 계정은 현재 정보를 볼 수 있고 저장할 수 없다', async () => {
    mocks.canWrite = false; mount();
    expect(await screen.findByLabelText('리그 이름')).toBeDisabled();
    expect(screen.getByRole('button', { name: '변경사항 저장' })).toBeDisabled();
    expect(submitted).toBeUndefined();
  });
});
