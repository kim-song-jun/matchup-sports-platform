import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { V1TournamentField, V1TournamentOperationsBoardItem } from '@/types/api';
import { MatchInfoSheet } from './match-info-sheet';
import { buildBoardCards, type BoardCard } from './ops-board-model';

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/live/t-1/operations',
  useRouter: () => ({ replace: vi.fn(), back: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function fx(id: string, fieldId: string | null, scheduledAt: string, over: Partial<V1TournamentOperationsBoardItem> = {}): V1TournamentOperationsBoardItem {
  return {
    fixtureId: id,
    tournamentId: 't-1',
    round: '조별리그',
    fixtureNumber: 1,
    legNumber: null,
    groupName: null,
    gameId: `g-${id}`,
    gameState: 'SCHEDULED',
    fieldId,
    fieldName: fieldId === null ? null : fieldId === 'f1' ? '구장 1' : '구장 2',
    homeRegistrationId: 'r-h',
    awayRegistrationId: 'r-a',
    scheduledAt,
    currentScore: null,
    currentRevisionState: null,
    warnings: [],
    version: 1,
    revisionId: null,
    stableRevision: 'v1',
    ...over,
  };
}

const fields: V1TournamentField[] = [
  { id: 'f1', tournamentId: 't-1', scopeKey: 'f1', name: '구장 1', sortOrder: 1, active: true, version: 1 },
  { id: 'f2', tournamentId: 't-1', scopeKey: 'f2', name: '구장 2', sortOrder: 2, active: true, version: 1 },
];

const AT = '2026-12-20T01:00:00Z';
const items = [
  fx('f9', 'f1', AT, { warnings: ['MISSING_SCORER'] }),
  fx('clash', 'f2', AT),
  fx('cancelled', 'f2', AT, { gameState: 'CANCELLED' }),
  fx('later', 'f2', '2026-12-20T03:00:00Z'),
];

function cards(): BoardCard[] {
  return buildBoardCards({
    items,
    liveWarnings: new Map(),
    labelFor: (item) => ({ title: item.fixtureId === 'clash' ? '겹치는 경기' : `경기 ${item.fixtureId}`, subtitle: '' }),
    staff: [],
    role: 'PLATFORM_OPS',
    now: new Date('2026-12-20T00:00:00Z'),
  });
}

const patches: unknown[] = [];
let deletes = 0;
let patchStatus = 200;

const server = setupServer(
  http.patch('*/api/v1/tournament-ops/tournaments/:tid/fixtures/:fid/field', async ({ request }) => {
    patches.push(await request.json());
    if (patchStatus !== 200) {
      return HttpResponse.json({ status: 'error', statusCode: patchStatus, code: 'FIELD_FAIL', message: '지금은 구장을 바꿀 수 없어요.' }, { status: patchStatus });
    }
    return HttpResponse.json({ status: 'success', timestamp: 't', data: { fixtureId: 'f9', tournamentId: 't-1', fieldId: 'f2' } });
  }),
  http.post('*/api/v1/logs/client-error', () => HttpResponse.json({ status: 'success', timestamp: 't', data: null })),
  http.delete('*/api/v1/tournament-ops/tournaments/:tid/fixtures/:fid/field', () => {
    deletes += 1;
    return HttpResponse.json({ status: 'success', timestamp: 't', data: { fixtureId: 'f9', tournamentId: 't-1', fieldId: null } });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => {
  patches.length = 0;
  deletes = 0;
  patchStatus = 200;
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
});

function renderSheet(over: { canAssignField?: boolean; card?: string; liveBase?: string; consoleQuery?: string } = {}) {
  const all = cards();
  const card = all.find((c) => c.fixtureId === (over.card ?? 'f9')) ?? null;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MatchInfoSheet
        card={card}
        allCards={all}
        fields={fields}
        canAssignField={over.canAssignField ?? true}
        liveBase={over.liveBase ?? '/admin/live/t-1'}
        consoleQuery={over.consoleQuery ?? ''}
        onClose={() => {}}
      />
    </QueryClientProvider>,
  );
}

describe('MatchInfoSheet', () => {
  it('시간·상태·구장·확인할 것과 경기 콘솔 입구를 보여 주고, 시간은 대진 관리에서 바꾼다고 알린다', () => {
    renderSheet();

    const dialog = screen.getByRole('dialog', { name: '경기 f9 경기 정보' });
    expect(within(dialog).getByText('예정')).toBeInTheDocument();
    expect(within(dialog).getByText('득점자 미기재')).toBeInTheDocument();
    expect(within(dialog).getByText(/시간은 대진 관리에서 바꿔요\./)).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: '경기 콘솔 열기' })).toHaveAttribute('href', '/admin/live/t-1/fixtures/f9/operate');
    expect(within(dialog).getByRole('combobox', { name: '경기 f9 구장' })).toHaveValue('f1');
  });

  it('스태프 표면에서는 경기 콘솔 링크가 출처 쿼리를 싣는다', () => {
    renderSheet({ liveBase: '/tournament-ops/tournaments/t-1', consoleQuery: '?from=board' });
    expect(screen.getByRole('link', { name: '경기 콘솔 열기' })).toHaveAttribute('href', '/tournament-ops/tournaments/t-1/fixtures/f9/operate?from=board');
  });

  it('시간·구장이 겹치면 확인 창이 뜨고, 취소하면 저장하지 않는다', async () => {
    const user = userEvent.setup();
    renderSheet();

    await user.selectOptions(screen.getByRole('combobox', { name: '경기 f9 구장' }), 'f2');
    const confirmDialog = await screen.findByRole('dialog', { name: '시간·구장이 겹쳐요' });
    expect(confirmDialog).toHaveTextContent('겹치는 경기 경기와 시간·구장이 겹쳐요. 그대로 저장할까요?');
    await user.click(within(confirmDialog).getByRole('button', { name: '취소' }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: '시간·구장이 겹쳐요' })).not.toBeInTheDocument());
    expect(patches).toHaveLength(0);
    expect(screen.getByRole('combobox', { name: '경기 f9 구장' })).toHaveValue('f1');
  });

  it('겹쳐도 그대로 저장하면 구장 배정 요청이 한 번 나간다', async () => {
    const user = userEvent.setup();
    renderSheet();

    await user.selectOptions(screen.getByRole('combobox', { name: '경기 f9 구장' }), 'f2');
    const confirmDialog = await screen.findByRole('dialog', { name: '시간·구장이 겹쳐요' });
    await user.click(within(confirmDialog).getByRole('button', { name: '그대로 저장' }));

    await waitFor(() => expect(patches).toEqual([{ fieldId: 'f2' }]));
  });

  it('취소된 경기와는 겹침으로 보지 않아 확인 없이 저장한다', async () => {
    const user = userEvent.setup();
    const all = cards().map((c) => (c.fixtureId === 'clash' ? { ...c, state: 'cancelled' as const, item: { ...c.item, gameState: 'CANCELLED' as const } } : c));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MatchInfoSheet card={all.find((c) => c.fixtureId === 'f9') ?? null} allCards={all} fields={fields} canAssignField liveBase="/admin/live/t-1" consoleQuery="" onClose={() => {}} />
      </QueryClientProvider>,
    );

    await user.selectOptions(screen.getByRole('combobox', { name: '경기 f9 구장' }), 'f2');

    await waitFor(() => expect(patches).toEqual([{ fieldId: 'f2' }]));
    expect(screen.queryByRole('dialog', { name: '시간·구장이 겹쳐요' })).not.toBeInTheDocument();
  });

  it('겹치지 않는 시각이면 확인 없이 저장한다', async () => {
    const user = userEvent.setup();
    renderSheet({ card: 'later' });

    await user.selectOptions(screen.getByRole('combobox', { name: '경기 later 구장' }), 'f1');

    await waitFor(() => expect(patches).toEqual([{ fieldId: 'f1' }]));
    expect(screen.queryByRole('dialog', { name: '시간·구장이 겹쳐요' })).not.toBeInTheDocument();
  });

  it('구장 미정을 고르면 배정을 해제한다', async () => {
    const user = userEvent.setup();
    renderSheet();

    await user.selectOptions(screen.getByRole('combobox', { name: '경기 f9 구장' }), '');

    await waitFor(() => expect(deletes).toBe(1));
    expect(patches).toHaveLength(0);
  });

  it('저장이 실패하면 시트 안에 알리고 선택을 서버 값으로 되돌린다', async () => {
    patchStatus = 500;
    const user = userEvent.setup();
    renderSheet({ card: 'later' });

    await user.selectOptions(screen.getByRole('combobox', { name: '경기 later 구장' }), 'f1');

    expect(await screen.findByRole('alert')).toHaveTextContent('지금은 구장을 바꿀 수 없어요.');
    expect(screen.getByRole('combobox', { name: '경기 later 구장' })).toHaveValue('f2');
  });

  it('구장을 바꿀 권한이 없으면 select 없이 구장 이름만 보여 준다', () => {
    renderSheet({ canAssignField: false });

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(within(screen.getByRole('dialog')).getByText('구장 1')).toBeInTheDocument();
  });

  it('카드가 없으면 아무것도 그리지 않는다', () => {
    renderSheet({ card: 'nope' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
