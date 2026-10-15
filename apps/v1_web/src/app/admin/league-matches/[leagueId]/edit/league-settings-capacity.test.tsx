import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LeagueSettings } from '@/types/league-settings';
import LeagueSettingsClient from './league-settings-client';

vi.mock('@/hooks/use-admin-can-write', () => ({ useAdminCanWrite: () => true }));
const initial: LeagueSettings = {
  leagueId: 'league-capacity', title: '정원 리그', rulesText: '', regionId: 'region-jung',
  startsOn: '2098-01-01T00:00:00.000Z', endsOn: '2098-02-01T00:00:00.000Z',
  registrationDeadlineAt: '2097-12-31T00:00:00.000Z', plannedFixtureCount: 12, maxTeams: 6,
  updatedAt: '2026-10-15T00:00:00.000Z', status: 'open', sportName: '풋살',
};
const path = '*/api/v1/admin/league-matches/league-capacity/settings';
let stored = { ...initial };
let submitted: unknown;
const success = (data: unknown) => HttpResponse.json({ status: 'success', data, timestamp: initial.updatedAt });
const server = setupServer(
  http.get(path, () => success(stored)),
  http.get('*/api/v1/master/regions', () => success([{ id: 'region-seoul', name: '서울', level: 1,
    children: [{ id: 'region-jung', name: '중구', parentId: 'region-seoul', level: 2 }] }])),
  http.patch(path, async ({ request }) => {
    const payload: unknown = await request.json();
    submitted = payload;
    if (typeof payload !== 'object' || payload === null || !('maxTeams' in payload)
      || (payload.maxTeams !== null && typeof payload.maxTeams !== 'number')) {
      return HttpResponse.json({ message: '참가팀 정원을 보내 주세요.' }, { status: 400 });
    }
    stored = { ...stored, maxTeams: payload.maxTeams, updatedAt: '2026-10-15T01:00:00.000Z' };
    return success(stored);
  }),
  http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })),
);
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><LeagueSettingsClient leagueId="league-capacity" /></QueryClientProvider>);
}
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => { cleanup(); server.resetHandlers(); });
beforeEach(() => { stored = { ...initial }; submitted = undefined; });

describe('MD-QA145 리그 설정의 실제 GET/PATCH 참가팀 정원 계약', () => {
  it.each([60, 2147483647])('저장된 정원을 읽고 %i팀으로 저장한 뒤 다시 조회한다', async (maxTeams) => {
    // Given: 서버에 참가팀 정원 6팀이 저장되어 있어요.
    const view = mount();
    const capacity = await screen.findByLabelText(/^참가팀 정원/);
    expect(capacity).toHaveValue(6);
    // When: 기존 선수 정원이나 템플릿과 관계없이 참가팀 정원을 바꿔요.
    fireEvent.change(capacity, { target: { value: String(maxTeams) } });
    fireEvent.click(screen.getByRole('button', { name: '변경사항 저장' }));
    // Then: 실제 PATCH와 새 GET이 같은 정원을 유지해요.
    await waitFor(() => expect(submitted).toMatchObject({ maxTeams, expectedUpdatedAt: initial.updatedAt }));
    expect(await screen.findByText('리그 정보를 저장했어요.')).toBeInTheDocument();
    expect(screen.getByLabelText(/^참가팀 정원/)).toHaveValue(maxTeams);
    view.unmount();
    mount();
    expect(await screen.findByLabelText(/^참가팀 정원/)).toHaveValue(maxTeams);
  });

  it('기존 정원을 지우면 null로 저장하고 다시 조회해도 무제한이다', async () => {
    // Given: 유한 정원을 가진 리그예요.
    const view = mount();
    const capacity = await screen.findByLabelText(/^참가팀 정원/);
    // When: 정원 입력을 비운 뒤 저장해요.
    fireEvent.change(capacity, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '변경사항 저장' }));
    // Then: 무제한을 명시적으로 저장하고 다음 GET도 비어 있는 필드로 표시해요.
    await waitFor(() => expect(submitted).toMatchObject({ maxTeams: null }));
    await screen.findByText('리그 정보를 저장했어요.');
    view.unmount();
    mount();
    expect(await screen.findByLabelText(/^참가팀 정원/)).toHaveValue(null);
  });

  it.each(['0', '1.5', '2147483648'])('정원 %s는 PATCH하지 않고 수정할 수 있게 보존한다', async (value) => {
    // Given: 서버의 기존 정원을 읽었어요.
    mount();
    const capacity = await screen.findByLabelText(/^참가팀 정원/);
    // When: 양의 32비트 정수가 아닌 정원으로 바꿔요.
    fireEvent.change(capacity, { target: { value } });
    // Then: 저장을 막고 서버의 유효한 기존 값은 바꾸지 않아요.
    expect(screen.getByRole('button', { name: '변경사항 저장' })).toBeDisabled();
    expect(capacity).toHaveValue(Number(value));
    expect(submitted).toBeUndefined();
    expect(stored.maxTeams).toBe(6);
  });

  it.each([
    { code: 'LEAGUE_CAPACITY_BELOW_OCCUPANCY', message: '참가팀 정원은 확정·입금대기 팀 수보다 작게 설정할 수 없어요.' },
    { code: 'LEAGUE_SETTINGS_STALE', message: '최신 정보를 다시 불러와 주세요.' },
  ])('$code 저장 거절은 정원 초안과 서버 실패 원인을 보존한다', async ({ code, message }) => {
    // Given: 점유 수 축소나 오래된 수정 버전은 서버가 거절해요.
    server.use(http.patch(path, async ({ request }) => {
      submitted = await request.json();
      return HttpResponse.json({ statusCode: 409, code, message }, { status: 409 });
    }));
    mount();
    const capacity = await screen.findByLabelText(/^참가팀 정원/);
    fireEvent.change(capacity, { target: { value: '2' } });
    // When: 정원 변경을 저장해요.
    fireEvent.click(screen.getByRole('button', { name: '변경사항 저장' }));
    // Then: 성공을 표시하지 않고 실제 요청 값과 실패 사유를 보여줘요.
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(submitted).toMatchObject({ maxTeams: 2, expectedUpdatedAt: initial.updatedAt });
    expect(screen.getByLabelText(/^참가팀 정원/)).toHaveValue(2);
    expect(screen.queryByText('리그 정보를 저장했어요.')).not.toBeInTheDocument();
    expect(stored.maxTeams).toBe(6);
  });
});
