import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminLeagueMatchNewPage from './page';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/admin/league-matches/new',
  useSearchParams: () => new URLSearchParams(),
}));

let submitted: unknown;
const success = (data: unknown) => HttpResponse.json({ status: 'success', data, timestamp: '2026-10-15T00:00:00.000Z' });
const server = setupServer(
  http.get('*/api/v1/master/sports', () => success([{ id: 'sport-futsal', name: '풋살', levels: [] }])),
  http.get('*/api/v1/master/regions', () => success([{ id: 'region-seoul', name: '서울', level: 1,
    children: [{ id: 'region-jung', name: '중구', parentId: 'region-seoul', level: 2 }] }])),
  http.get('*/api/v1/teams', () => success({ items: ['팀A', '팀B'].map((name, index) => ({
    id: `team-${index}`, name, sportName: '풋살', sport: { sportId: 'sport-futsal', name: '풋살' },
    regionName: '서울', memberCount: 12, trustState: 'none', joinPolicy: 'approval_required',
  })), nextCursor: null })),
  http.get('*/api/v1/admin/competition-configs/lineup-size-options', () => success({
    sportId: 'sport-futsal', supported: true, options: [], defaultMaxPlayers: null,
    substitutionModes: [], defaultSubstitutionMode: null, defaultMaxSubstitutions: null, defaultPeriods: [],
  })),
  http.post('*/api/v1/admin/league-matches', async ({ request }) => {
    submitted = await request.json();
    return success({ leagueId: 'league-created', title: '정원 테스트 리그', state: 'draft' });
  }),
  http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => { cleanup(); server.resetHandlers(); });
beforeEach(() => { submitted = undefined; push.mockReset(); });

async function fillForm() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><AdminLeagueMatchNewPage /></QueryClientProvider>);
  await screen.findByRole('option', { name: '풋살' });
  await screen.findByRole('option', { name: '서울 중구' });
  fireEvent.change(screen.getByLabelText('리그 이름'), { target: { value: '정원 테스트 리그' } });
  fireEvent.change(screen.getByLabelText('종목'), { target: { value: 'sport-futsal' } });
  fireEvent.change(screen.getByLabelText('지역'), { target: { value: 'region-jung' } });
  fireEvent.change(screen.getByLabelText('시작일'), { target: { value: '2098-01-01' } });
  fireEvent.change(screen.getByLabelText('종료일'), { target: { value: '2098-02-01' } });
  for (const name of ['팀A', '팀B']) {
    const picker = screen.getByLabelText('참가 팀 추가 (최소 2팀)');
    fireEvent.focus(picker);
    fireEvent.change(picker, { target: { value: name } });
    fireEvent.click(await screen.findByText(name));
  }
}

describe('MD-QA145 리그 생성의 실제 HTTP 참가팀 정원 계약', () => {
  it.each([2, 60, 2147483647])('참가팀 정원 %i팀을 선수 정원과 별개로 POST한다', async (maxTeams) => {
    // Given: 참가팀을 선택한 실제 생성 폼과 팀당 선수 제한이 있어요.
    await fillForm();
    fireEvent.click(screen.getByLabelText('제한 없음'));
    fireEvent.change(screen.getByLabelText('최소 (명)'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('최대 (명)'), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText(/^참가팀 정원/), { target: { value: String(maxTeams) } });
    // When: 운영자가 리그를 만들어요.
    fireEvent.click(screen.getByRole('button', { name: '리그 만들기' }));
    // Then: 실제 API 클라이언트가 두 정원을 서로 다른 필드로 직렬화해요.
    await waitFor(() => expect(submitted).toMatchObject({ maxTeams, minPlayers: 5, maxPlayers: 12, teamIds: ['team-0', 'team-1'] }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/admin/league-matches/league-created'));
  });

  it('참가팀 정원을 비우면 무제한을 보내고 선수 정원도 기존 무제한을 유지한다', async () => {
    // Given: 팀 수 제한을 정하지 않은 실제 생성 폼이에요.
    await fillForm();
    expect(screen.getByLabelText(/^참가팀 정원/)).toHaveValue(null);
    // When: 기본값으로 생성해요.
    fireEvent.click(screen.getByRole('button', { name: '리그 만들기' }));
    // Then: 템플릿이나 선택한 팀 수를 정원으로 쓰지 않아요.
    await waitFor(() => expect(submitted).toMatchObject({ maxTeams: null, minPlayers: 1, maxPlayers: null }));
  });

  it.each(['0', '1.5', '2147483648'])('참가팀 정원 %s는 저장하지 않고 입력을 고칠 수 있다', async (value) => {
    // Given: 나머지 필수 항목을 채웠어요.
    await fillForm();
    // When: 양의 32비트 정수가 아닌 정원을 넣어요.
    fireEvent.change(screen.getByLabelText(/^참가팀 정원/), { target: { value } });
    // Then: 실제 제출을 막고 잘못 입력한 값을 보존해요.
    expect(screen.getByRole('button', { name: '리그 만들기' })).toBeDisabled();
    expect(submitted).toBeUndefined();
    expect(screen.getByLabelText(/^참가팀 정원/)).toHaveValue(Number(value));
  });
});
