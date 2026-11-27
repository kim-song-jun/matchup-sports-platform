import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TournamentOpsRoleProvider } from '@/components/tournament-ops/role-context';
import { installViewport, resizeViewport } from '@/test/viewport';
import type { V1TournamentOperationsBoardItem, V1TournamentStaffRole } from '@/types/api';
import { OperationsBoardClient } from './operations-board-client';

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/live/t-1/operations',
  useRouter: () => ({ replace: vi.fn(), back: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const kst = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00+09:00`).toISOString();
const D20 = '2026-12-20';

function fx(n: number, fieldId: string | null, at: string | null, over: Partial<V1TournamentOperationsBoardItem> = {}): V1TournamentOperationsBoardItem {
  return {
    fixtureId: `f${n}`,
    tournamentId: 't-1',
    round: '조별리그 1라운드',
    fixtureNumber: n,
    legNumber: null,
    groupName: 'A조',
    gameId: `g${n}`,
    gameState: 'SCHEDULED',
    fieldId,
    fieldName: fieldId === null ? null : fieldId === 'fld1' ? '구장 1' : fieldId === 'fld2' ? '구장 2' : fieldId === 'fld3' ? '구장 3' : '구장 4',
    homeRegistrationId: `rh${n}`,
    awayRegistrationId: `ra${n}`,
    scheduledAt: at,
    currentScore: null,
    currentRevisionState: null,
    warnings: [],
    version: 1,
    revisionId: null,
    stableRevision: `s${n}`,
    ...over,
  };
}

const official = { gameState: 'ENDED' as const, revisionId: 'rev', currentRevisionState: 'OFFICIAL' as const };

function dayItems(): V1TournamentOperationsBoardItem[] {
  return [
    fx(1, 'fld1', kst(D20, '09:00'), { ...official, currentScore: { home: 2, away: 1 } }),
    fx(6, 'fld2', kst(D20, '09:00'), { ...official, currentScore: { home: 0, away: 0 } }),
    fx(7, 'fld2', kst(D20, '09:30'), { gameState: 'ENDED' }),
    fx(2, 'fld1', kst(D20, '10:00'), { gameState: 'LIVE' }),
    fx(8, 'fld2', kst(D20, '10:30'), {}),
    fx(3, 'fld1', kst(D20, '11:00'), {}),
    fx(12, 'fld2', kst(D20, '14:30'), {}),
    fx(90, 'fld1', null, {}),
    fx(91, 'fld1', null, {}),
  ];
}

function operator(fieldId: string, name: string, expiresAt: string | null) {
  return {
    id: `s-${fieldId}`, tournamentId: 't-1', userId: `u-${fieldId}`, role: 'FIELD_OPERATOR', fieldId, fixtureIds: [], version: 1,
    expiresAt, revokedAt: null, grantedByUserId: null, createdAt: '2026-12-01T00:00:00.000Z', nickname: name,
  };
}

interface Scenario {
  pages: Array<{ items: V1TournamentOperationsBoardItem[]; nextCursor: string | null }>;
  fields: Array<{ id: string; name: string; sortOrder: number }>;
  staff: unknown[];
  fixtures: unknown[];
  leagueFixtures: unknown[];
  kind: string;
}

let scenario: Scenario;
const operationRequests: string[] = [];
let boardFails = false;

function defaultScenario(): Scenario {
  const items = dayItems();
  return {
    pages: [{ items, nextCursor: null }],
    fields: [{ id: 'fld1', name: '구장 1', sortOrder: 1 }, { id: 'fld2', name: '구장 2', sortOrder: 2 }],
    staff: [operator('fld1', '김도윤', null), operator('fld2', '이서연', kst(D20, '14:00'))],
    fixtures: items.map((item) => ({
      id: item.fixtureId, homeTeamName: `홈${item.fixtureNumber}`, awayTeamName: `원정${item.fixtureNumber}`, homeSlotLabel: null, awaySlotLabel: null,
      round: item.round, fixtureNumber: item.fixtureNumber, liveStatus: 'scheduled', status: 'scheduled',
    })),
    leagueFixtures: [],
    kind: 'regular_tournament',
  };
}

const ok = (data: unknown) => HttpResponse.json({ status: 'success', timestamp: '2026-12-20T01:15:00.000Z', data });

const server = setupServer(
  http.get('*/api/v1/tournament-ops/tournaments/:id/operations', ({ request }) => {
    const cursor = new URL(request.url).searchParams.get('cursor');
    operationRequests.push(cursor ?? 'first');
    if (boardFails) return new HttpResponse(null, { status: 500 });
    const index = cursor === null ? 0 : Number(cursor.replace('c', ''));
    const page = scenario.pages[index];
    return ok({ items: page.items, nextCursor: page.nextCursor, watermark: 'w', liveWarnings: [] });
  }),
  // 500 응답은 클라이언트 오류 로그 전송을 부른다.
  http.post('*/api/v1/logs/client-error', () => ok({})),
  http.get('*/api/v1/tournament-ops/tournaments/:id/fields', () =>
    ok({ items: scenario.fields.map((f) => ({ ...f, tournamentId: 't-1', scopeKey: f.id, active: true, version: 1 })) }),
  ),
  http.get('*/api/v1/tournament-ops/tournaments/:id/staff', () => ok({ items: scenario.staff })),
  http.get('*/api/v1/tournaments/:id', () =>
    ok({ id: 't-1', title: '겨울 풋살컵', kind: scenario.kind, status: 'in_progress', fixtures: scenario.fixtures, leagueFixtures: scenario.leagueFixtures }),
  ),
);

let restoreViewport: () => void;

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  restoreViewport();
  vi.useRealTimers();
});
afterAll(() => server.close());
beforeEach(() => {
  scenario = defaultScenario();
  operationRequests.length = 0;
  boardFails = false;
  restoreViewport = installViewport(1280);
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(kst(D20, '10:15')));
});

function renderBoard(role: V1TournamentStaffRole = 'PLATFORM_OPS') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TournamentOpsRoleProvider role={role}>
        <OperationsBoardClient tournamentId="t-1" />
      </TournamentOpsRoleProvider>
    </QueryClientProvider>,
  );
}

describe('OperationsBoardClient — 데스크톱', () => {
  it('구장 열 머리와 시간 판을 그리고, 시간 미정 경기는 판 아래 묶음에 둔다', async () => {
    renderBoard();
    await screen.findByRole('columnheader', { name: /구장 1/ });

    expect(screen.getByRole('columnheader', { name: /구장 2/ })).toHaveTextContent('구장 담당자 이서연');
    expect(screen.getByRole('columnheader', { name: /구장 2/ })).toHaveTextContent('14:00까지');
    const table = screen.getByRole('table', { name: '구장별 경기 시간표' });
    const bundle = screen.getByRole('heading', { name: '시간 미정 2' });
    expect(table.compareDocumentPosition(bundle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('article', { name: '홈90 vs 원정90' })).toBeInTheDocument();
    expect(screen.getByRole('separator', { name: '지금 10:15' })).toBeInTheDocument();
  });

  it('상태·구장·경고 select 와 운영 콘솔 링크가 없고, 카드마다 할 일은 하나다', async () => {
    renderBoard();
    await screen.findByRole('columnheader', { name: /구장 1/ });

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /운영 콘솔/ })).not.toBeInTheDocument();
    expect(screen.queryByText('전체 필드')).not.toBeInTheDocument();
    for (const article of screen.getAllByRole('article')) {
      expect(within(article).queryAllByRole('link').length).toBeLessThanOrEqual(1);
    }
    expect(within(screen.getByRole('article', { name: '홈7 vs 원정7' })).getByRole('link')).toHaveAttribute('href', '/admin/live/t-1/results?fixtureId=f7');
    expect(within(screen.getByRole('article', { name: '홈2 vs 원정2' })).getByRole('link')).toHaveAttribute('href', '/admin/live/t-1/fixtures/f2/operate');
    expect(within(screen.getByRole('article', { name: '홈1 vs 원정1' })).getByRole('link', { name: /결과 고치기/ })).toHaveAttribute('href', '/admin/live/t-1/results?fixtureId=f1');
  });

  it('머리말이 선택한 날 기준 개수와 15초 갱신을 알린다', async () => {
    renderBoard();
    await screen.findByRole('columnheader', { name: /구장 1/ });

    expect(screen.getByText(/겨울 풋살컵 · 12\. 20\.\(일\)/)).toBeInTheDocument();
    expect(screen.getByText(/끝남 3 · 진행 중 1 · 남은 경기 3 · 10:15 기준 · 15초마다 새로 고쳐요/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '새로고침' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /참가자 화면 보기/ })).toHaveAttribute('href', '/tournaments/t-1');
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['운영 보드']);
  });

  it('구장 4곳이면 앞 3곳만 열로 그리고, 칩은 최대 3곳까지 고른다', async () => {
    const items = [
      fx(1, 'fld1', kst(D20, '09:00')), fx(2, 'fld2', kst(D20, '09:00')), fx(3, 'fld3', kst(D20, '09:00')), fx(4, 'fld4', kst(D20, '09:00')),
    ];
    scenario.pages = [{ items, nextCursor: null }];
    scenario.fields = ['1', '2', '3', '4'].map((n, i) => ({ id: `fld${n}`, name: `구장 ${n}`, sortOrder: i }));
    scenario.staff = [];
    scenario.fixtures = items.map((item) => ({ id: item.fixtureId, homeTeamName: `홈${item.fixtureNumber}`, awayTeamName: `원정${item.fixtureNumber}`, homeSlotLabel: null, awaySlotLabel: null }));
    const user = userEvent.setup();
    renderBoard();
    await screen.findByRole('columnheader', { name: /구장 1/ });

    const chips = within(screen.getByRole('group', { name: '구장 고르기' }));
    expect(screen.getAllByRole('columnheader').filter((h) => /^구장 \d/.test(h.textContent ?? ''))).toHaveLength(3);
    expect(chips.getByRole('button', { name: '구장 4' })).toBeDisabled();
    expect(chips.queryByRole('button', { name: '전체' })).not.toBeInTheDocument();

    await user.click(chips.getByRole('button', { name: '구장 1' }));
    expect(chips.getByRole('button', { name: '구장 4' })).toBeEnabled();
    await user.click(chips.getByRole('button', { name: '구장 4' }));
    expect(screen.getByRole('columnheader', { name: /구장 4/ })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /구장 1/ })).not.toBeInTheDocument();
  });

  it('구장 담당자가 한 곳도 없으면 보드 위 안내 한 줄만 두고 카드마다 경고하지 않는다', async () => {
    scenario.staff = [];
    renderBoard();
    await screen.findByRole('columnheader', { name: /구장 1/ });

    expect(screen.getAllByText('구장 담당자가 아직 없어요.', { exact: false })).toHaveLength(1);
    expect(screen.getByRole('link', { name: '스태프·구장' })).toHaveAttribute('href', '/admin/live/t-1/staff');
    expect(screen.queryByText('구장 담당자가 없어요')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /담당자 배정하기/ })).not.toBeInTheDocument();
  });

  it('지원은 확정·고치기·담당자 버튼 없이 결과 보기만 얻고 점수와 상태를 본다', async () => {
    renderBoard('SUPPORT_READONLY');
    await screen.findByRole('columnheader', { name: /구장 1/ });

    expect(screen.queryByRole('link', { name: /결과 확정|결과 고치기|담당자 배정하기/ })).not.toBeInTheDocument();
    expect(within(screen.getByRole('article', { name: '홈7 vs 원정7' })).getByRole('link', { name: /결과 보기/ })).toHaveAttribute('href', '/admin/live/t-1/results?fixtureId=f7');
    expect(within(screen.getByRole('article', { name: '홈1 vs 원정1' })).getByRole('link', { name: /결과 보기/ })).toHaveAttribute('href', '/admin/live/t-1/results?fixtureId=f1');
    expect(screen.queryByText(/구장 담당자가 아직 없어요/)).not.toBeInTheDocument();
    expect(screen.getByRole('article', { name: '홈1 vs 원정1' })).toHaveTextContent('2 : 1');
    expect(screen.getByRole('article', { name: '홈7 vs 원정7' })).toHaveTextContent('결과 확정 대기');
  });

  it('먼 예정 경기의 제목을 누르면 경기 정보 시트에서 경기 콘솔로 갈 수 있다', async () => {
    const user = userEvent.setup();
    renderBoard();
    await screen.findByRole('columnheader', { name: /구장 1/ });

    await user.click(screen.getByRole('button', { name: '홈3 vs 원정3 경기 정보' }));

    const dialog = screen.getByRole('dialog', { name: '홈3 vs 원정3 경기 정보' });
    expect(within(dialog).getByRole('link', { name: '경기 콘솔 열기' })).toHaveAttribute('href', '/admin/live/t-1/fixtures/f3/operate');
    expect(within(dialog).getByRole('combobox', { name: '홈3 vs 원정3 구장' })).toHaveValue('fld1');
  });
});

function withFields(count: number, extra: V1TournamentOperationsBoardItem[]) {
  const items = [
    ...Array.from({ length: count }, (_, i) => fx(i + 1, `fld${i + 1}`, kst(D20, '09:00'))),
    ...extra,
  ];
  scenario.pages = [{ items, nextCursor: null }];
  scenario.fields = Array.from({ length: count }, (_, i) => ({ id: `fld${i + 1}`, name: `구장 ${i + 1}`, sortOrder: i }));
  scenario.staff = [];
  scenario.fixtures = items.map((item) => ({ id: item.fixtureId, homeTeamName: `홈${item.fixtureNumber}`, awayTeamName: `원정${item.fixtureNumber}`, homeSlotLabel: null, awaySlotLabel: null }));
}

describe('OperationsBoardClient — 구장 미정과 칩 모드', () => {
  const unassigned = () => fx(9, null, kst(D20, '10:00'), { warnings: ['MISSING_SCORER'] });

  it('구장 3곳 + 구장 미정은 구장 4열로 세지 않아 칩 모드가 아니고, 미정 열이 보이고 센다', async () => {
    withFields(3, [unassigned()]);
    renderBoard();

    await screen.findByRole('columnheader', { name: /구장 3/ });
    expect(screen.getByRole('columnheader', { name: /구장 미정/ })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: '홈9 vs 원정9' })).toBeInTheDocument();
    const chips = within(screen.getByRole('group', { name: '구장 고르기' }));
    expect(chips.getByRole('button', { name: '전체' })).toBeInTheDocument();
    expect(chips.getAllByRole('button').filter((b) => (b as HTMLButtonElement).disabled)).toHaveLength(0);
    expect(screen.getByRole('button', { name: '확인할 것 1' })).toBeInTheDocument();
  });

  it('구장 4곳 + 구장 미정은 구장 3곳만 열로 고르되 미정 열은 늘 보이고 센다', async () => {
    withFields(4, [unassigned()]);
    renderBoard();

    await screen.findByRole('columnheader', { name: /구장 1/ });
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent ?? '');
    expect(headers.filter((h) => /^구장 [1-4]/.test(h))).toHaveLength(3);
    expect(headers.some((h) => h.startsWith('구장 미정'))).toBe(true);
    expect(screen.getByRole('article', { name: '홈9 vs 원정9' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '확인할 것 1' })).toBeInTheDocument();

    const chips = within(screen.getByRole('group', { name: '구장 고르기' }));
    expect(chips.queryByRole('button', { name: '전체' })).not.toBeInTheDocument();
    expect(chips.queryByRole('button', { name: '구장 미정' })).not.toBeInTheDocument();
    expect(chips.getByRole('button', { name: '구장 4' })).toBeDisabled();
  });

  it('구장 4곳 중 하나를 바꿔 골라도 구장 미정 경기는 남는다', async () => {
    withFields(4, [unassigned()]);
    const user = userEvent.setup();
    renderBoard();
    await screen.findByRole('columnheader', { name: /구장 1/ });

    const chips = within(screen.getByRole('group', { name: '구장 고르기' }));
    await user.click(chips.getByRole('button', { name: '구장 1' }));
    await user.click(chips.getByRole('button', { name: '구장 4' }));

    expect(screen.getByRole('article', { name: '홈9 vs 원정9' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '확인할 것 1' })).toBeInTheDocument();
  });
});

describe('OperationsBoardClient — 결과 무효', () => {
  it('무효 처리된 결과는 확정 대기가 아니라 「결과 무효」이고 결과 다시 입력으로 간다', async () => {
    scenario.pages = [{ items: [fx(5, 'fld1', kst(D20, '09:00'), { gameState: 'ENDED', revisionId: 'rev', currentRevisionState: 'VOID' })], nextCursor: null }];
    scenario.fixtures = [{ id: 'f5', homeTeamName: '홈5', awayTeamName: '원정5', homeSlotLabel: null, awaySlotLabel: null }];
    scenario.staff = [];
    const { container } = renderBoard();

    const card = await screen.findByRole('article', { name: '홈5 vs 원정5' });
    expect(within(card).getByText('결과 무효')).toBeInTheDocument();
    expect(within(card).queryByText('결과 확정 대기')).not.toBeInTheDocument();
    expect(within(card).getByRole('link', { name: /결과 다시 입력/ })).toHaveAttribute('href', '/admin/live/t-1/results?fixtureId=f5');
    expect(container.textContent).toMatch(/끝남 1/);
  });
});

describe('OperationsBoardClient — 확인할 것과 목록', () => {
  it('확인할 것을 켜면 담당자 없음 카드만 남고 개수가 같다(결과 확정 대기는 세지 않는다)', async () => {
    const user = userEvent.setup();
    renderBoard();
    await screen.findByRole('columnheader', { name: /구장 1/ });

    const toggle = screen.getByRole('button', { name: '확인할 것 1' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByRole('article').map((a) => a.getAttribute('aria-label'))).toEqual(['홈12 vs 원정12']);
    expect(within(screen.getByRole('article', { name: '홈12 vs 원정12' })).getByRole('link', { name: /담당자 배정하기/ })).toHaveAttribute('href', '/admin/live/t-1/staff');
  });

  it('필터에 걸리는 경기가 없으면 안내 문구를 보여 준다', async () => {
    scenario.staff = [operator('fld1', '김도윤', null), operator('fld2', '이서연', null)];
    const user = userEvent.setup();
    renderBoard();
    await screen.findByRole('columnheader', { name: /구장 1/ });

    await user.click(screen.getByRole('button', { name: '확인할 것 0' }));
    expect(screen.getByText('조건에 맞는 경기가 없어요')).toBeInTheDocument();
  });

  it('목록 보기는 구장 열 머리와 행마다 할 일 하나를 준다', async () => {
    const user = userEvent.setup();
    renderBoard();
    await screen.findByRole('columnheader', { name: /구장 1/ });

    await user.click(screen.getByRole('tab', { name: '목록' }));

    expect(screen.getByRole('columnheader', { name: '구장' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: '필드' })).not.toBeInTheDocument();
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(dayItems().length);
    for (const row of rows) {
      expect(within(row).getAllByRole('link')).toHaveLength(1);
    }
    expect(within(screen.getByRole('row', { name: /홈8 vs 원정8/ })).getByRole('link')).toHaveTextContent('경기 콘솔 열기');
    expect(within(screen.getByRole('row', { name: /홈1 vs 원정1/ })).getByText('2:1')).toBeInTheDocument();
  });
});

describe('OperationsBoardClient — 날짜', () => {
  it('하루짜리 대회에는 날짜 넘기기가 없다', async () => {
    renderBoard();
    await screen.findByRole('columnheader', { name: /구장 1/ });

    expect(screen.queryByRole('button', { name: '다음 경기일' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '이전 경기일' })).not.toBeInTheDocument();
  });

  it('오늘 경기가 없으면 가장 가까운 경기일을 열고, 날짜를 넘길 수 있다', async () => {
    const items = [fx(1, 'fld1', kst('2026-12-19', '10:00')), fx(2, 'fld1', kst('2026-12-21', '10:00'))];
    scenario.pages = [{ items, nextCursor: null }];
    scenario.staff = [];
    scenario.fixtures = items.map((item) => ({ id: item.fixtureId, homeTeamName: `홈${item.fixtureNumber}`, awayTeamName: `원정${item.fixtureNumber}`, homeSlotLabel: null, awaySlotLabel: null }));
    const user = userEvent.setup();
    renderBoard();

    expect(await screen.findByRole('article', { name: '홈1 vs 원정1' })).toBeInTheDocument();
    expect(screen.getAllByText(/12\. 19\.\(토\)/).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: '오늘' })).not.toBeInTheDocument();
    expect(screen.queryByRole('separator', { name: /지금/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '이전 경기일' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: '다음 경기일' }));

    expect(await screen.findByRole('article', { name: '홈2 vs 원정2' })).toBeInTheDocument();
    expect(screen.queryByRole('article', { name: '홈1 vs 원정1' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다음 경기일' })).toBeDisabled();
  });

  it('오늘 경기가 있으면 오늘을 열고, 다른 날을 보다가 오늘로 돌아올 수 있다', async () => {
    const items = [fx(1, 'fld1', kst('2026-12-19', '10:00')), fx(2, 'fld1', kst(D20, '10:00')), fx(3, 'fld1', kst('2026-12-21', '10:00'))];
    scenario.pages = [{ items, nextCursor: null }];
    scenario.staff = [];
    scenario.fixtures = items.map((item) => ({ id: item.fixtureId, homeTeamName: `홈${item.fixtureNumber}`, awayTeamName: `원정${item.fixtureNumber}`, homeSlotLabel: null, awaySlotLabel: null }));
    const user = userEvent.setup();
    renderBoard();

    expect(await screen.findByRole('article', { name: '홈2 vs 원정2' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '오늘' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '이전 경기일' }));
    expect(await screen.findByRole('article', { name: '홈1 vs 원정1' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '오늘' }));
    expect(await screen.findByRole('article', { name: '홈2 vs 원정2' })).toBeInTheDocument();
  });

  it('KST 자정 앞뒤 경기는 서로 다른 날이다', async () => {
    const items = [fx(1, 'fld1', '2026-12-20T14:30:00.000Z'), fx(2, 'fld1', '2026-12-20T15:30:00.000Z')];
    scenario.pages = [{ items, nextCursor: null }];
    scenario.staff = [];
    scenario.fixtures = items.map((item) => ({ id: item.fixtureId, homeTeamName: `홈${item.fixtureNumber}`, awayTeamName: `원정${item.fixtureNumber}`, homeSlotLabel: null, awaySlotLabel: null }));
    renderBoard();

    expect(await screen.findByRole('article', { name: '홈1 vs 원정1' })).toBeInTheDocument();
    expect(screen.queryByRole('article', { name: '홈2 vs 원정2' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다음 경기일' })).toBeEnabled();
  });

  it('서버 페이지가 둘이어도 끝까지 읽어 한 보드에 그린다', async () => {
    const first = [fx(1, 'fld1', kst(D20, '09:00'))];
    const second = [fx(2, 'fld1', kst(D20, '10:00'))];
    scenario.pages = [{ items: first, nextCursor: 'c1' }, { items: second, nextCursor: null }];
    scenario.staff = [];
    scenario.fixtures = [...first, ...second].map((item) => ({ id: item.fixtureId, homeTeamName: `홈${item.fixtureNumber}`, awayTeamName: `원정${item.fixtureNumber}`, homeSlotLabel: null, awaySlotLabel: null }));
    renderBoard();

    expect(await screen.findByRole('article', { name: '홈2 vs 원정2' })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: '홈1 vs 원정1' })).toBeInTheDocument();
    expect(operationRequests).toEqual(['first', 'c1']);
  });
});

describe('OperationsBoardClient — 갱신 상태', () => {
  it('「기준」 시각은 기기 시계가 아니라 마지막으로 받은 시각이다', async () => {
    const user = userEvent.setup();
    renderBoard();
    await screen.findByRole('columnheader', { name: /구장 1/ });
    expect(screen.getByText(/10:15 기준 · 15초마다 새로 고쳐요/)).toBeInTheDocument();

    vi.setSystemTime(new Date(kst(D20, '10:20')));
    await user.click(screen.getByRole('button', { name: '새로고침' }));

    expect(await screen.findByText(/10:20 기준 · 15초마다 새로 고쳐요/)).toBeInTheDocument();
  });

  it('갱신이 실패하면 옛 카드 위에 마지막으로 받은 시각과 함께 알리고, 다시 시도하면 사라진다', async () => {
    const user = userEvent.setup();
    renderBoard();
    await screen.findByRole('columnheader', { name: /구장 1/ });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    boardFails = true;
    vi.setSystemTime(new Date(kst(D20, '10:25')));
    await user.click(screen.getByRole('button', { name: '새로고침' }));

    const notice = await screen.findByRole('status');
    expect(notice).toHaveTextContent('새로 고치지 못했어요. 10:15 기준 화면이에요.');
    expect(screen.getByText(/10:15 기준 · 새로 고치지 못했어요/)).toBeInTheDocument();
    expect(screen.queryByText(/15초마다 새로 고쳐요/)).not.toBeInTheDocument();
    expect(screen.getByRole('article', { name: '홈2 vs 원정2' })).toBeInTheDocument();

    boardFails = false;
    vi.setSystemTime(new Date(kst(D20, '10:30')));
    await user.click(within(notice).getByRole('button', { name: '다시 시도' }));

    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expect(screen.getByText(/10:30 기준 · 15초마다 새로 고쳐요/)).toBeInTheDocument();
  });

  it('기기가 오프라인이라 갱신이 멈춰 있어도 같은 안내를 한다', async () => {
    const user = userEvent.setup();
    renderBoard();
    await screen.findByRole('columnheader', { name: /구장 1/ });

    onlineManager.setOnline(false);
    try {
      await user.click(screen.getByRole('button', { name: '새로고침' }));
      expect(await screen.findByRole('status')).toHaveTextContent('새로 고치지 못했어요. 10:15 기준 화면이에요.');
    } finally {
      onlineManager.setOnline(true);
    }
  });
});

describe('OperationsBoardClient — 폰', () => {
  it('구장 칩 하나가 열 하나이고, 끝난 경기는 한 줄로 접는다', async () => {
    restoreViewport();
    restoreViewport = installViewport(390);
    const user = userEvent.setup();
    renderBoard();
    await screen.findByRole('article', { name: '홈2 vs 원정2' });

    const chips = within(screen.getByRole('group', { name: '구장 고르기' }));
    expect(chips.getAllByRole('button').map((b) => b.textContent)).toEqual(['전체', '구장 1', '구장 2']);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '끝난 경기 2' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('article', { name: '홈1 vs 원정1' })).not.toBeInTheDocument();
    expect(screen.getByRole('article', { name: '홈7 vs 원정7' })).toBeInTheDocument();

    await user.click(chips.getByRole('button', { name: '구장 2' }));

    expect(screen.queryByRole('article', { name: '홈2 vs 원정2' })).not.toBeInTheDocument();
    expect(screen.getByRole('article', { name: '홈8 vs 원정8' })).toBeInTheDocument();
    expect(screen.getByText(/구장 2 · 구장 담당자 이서연 · 14:00까지 · 경기 4/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '끝난 경기 1' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('머리말은 대회명·날짜 한 줄, 개수 한 줄, 갱신 안내 한 줄이고 h1 이 하나뿐이며 상단 바 제목을 되풀이하지 않는다', async () => {
    restoreViewport();
    restoreViewport = installViewport(390);
    renderBoard();
    await screen.findByRole('article', { name: '홈2 vs 원정2' });

    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings.map((h) => h.textContent)).toEqual(['겨울 풋살컵 · 12. 20.(일)']);
    expect(headings[0]).toHaveClass('truncate');
    expect(screen.queryByRole('heading', { name: '운영 보드' })).not.toBeInTheDocument();
    expect(screen.getByText('끝남 3 · 진행 중 1 · 남은 경기 3')).toBeInTheDocument();
    expect(screen.getByText('10:15 기준 · 15초마다 새로 고쳐요')).toBeInTheDocument();
  });

  it('폰의 새로고침은 글자 없는 44×44 아이콘 버튼이고 누르면 운영 보드를 다시 읽는다', async () => {
    restoreViewport();
    restoreViewport = installViewport(390);
    const user = userEvent.setup();
    renderBoard();
    await screen.findByRole('article', { name: '홈2 vs 원정2' });

    const refresh = screen.getByRole('button', { name: '새로고침' });
    expect(refresh).toHaveTextContent('');
    expect(refresh).toHaveClass('h-11', 'w-11');
    const before = operationRequests.length;
    await user.click(refresh);

    await waitFor(() => expect(operationRequests.length).toBeGreaterThan(before));
  });

  it('폰의 「참가자 화면 보기」는 44px 높이의 글자 링크다', async () => {
    restoreViewport();
    restoreViewport = installViewport(390);
    renderBoard();
    await screen.findByRole('article', { name: '홈2 vs 원정2' });

    const link = screen.getByRole('link', { name: /참가자 화면 보기/ });
    expect(link).toHaveAttribute('href', '/tournaments/t-1');
    expect(link).toHaveClass('min-h-11');
    expect(link).not.toHaveClass('border');
  });

  it('창 폭이 바뀌면 판과 목록이 바뀐다', async () => {
    renderBoard();
    await screen.findByRole('table', { name: '구장별 경기 시간표' });

    resizeViewport(390);

    await waitFor(() => expect(screen.queryByRole('table')).not.toBeInTheDocument());
    expect(screen.getByRole('group', { name: '구장 고르기' })).toBeInTheDocument();
  });
});

describe('OperationsBoardClient — 빈 상태·특수 응답', () => {
  it('경기가 하나도 없으면 대진 전 안내를 보여 준다', async () => {
    scenario.pages = [{ items: [], nextCursor: null }];
    scenario.fixtures = [];
    scenario.staff = [];
    renderBoard();

    expect(await screen.findByText('아직 대진이 없어요')).toBeInTheDocument();
    expect(screen.getByText('대진을 만들면 여기에서 경기를 운영해요.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '다음 경기일' })).not.toBeInTheDocument();
  });

  it('리그 행(라운드·번호 없음)에서 null·undefined 가 화면에 찍히지 않는다', async () => {
    const items = [
      fx(1, 'fld1', kst(D20, '10:00'), { round: null, fixtureNumber: null, legNumber: null, groupName: null }),
      fx(2, null, null, { round: null, fixtureNumber: null, legNumber: null, groupName: null }),
    ];
    scenario.pages = [{ items, nextCursor: null }];
    scenario.kind = 'regular_league';
    scenario.fixtures = [];
    scenario.leagueFixtures = [{ teamMatchId: 'f1', title: '1주차 1경기' }, { teamMatchId: 'f2', title: '1주차 2경기' }];
    scenario.staff = [];
    const { container } = renderBoard();

    expect(await screen.findByRole('article', { name: '1주차 1경기' })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: '1주차 2경기' })).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/null|undefined/);
    expect(screen.getByRole('link', { name: /참가자 화면 보기/ })).toHaveAttribute('href', '/league-matches/t-1');
  });

  it('체험(demo) 모양 응답(gameState·legNumber 만 있고 번호 일부가 비어도)에서 null·undefined 가 찍히지 않는다', async () => {
    const demoLike = { ...fx(1, 'fld1', kst(D20, '10:00')), gameState: undefined, gameId: undefined, version: undefined } as unknown as V1TournamentOperationsBoardItem;
    scenario.pages = [{ items: [demoLike], nextCursor: null }];
    scenario.staff = [];
    const { container } = renderBoard();

    expect(await screen.findByRole('article', { name: '홈1 vs 원정1' })).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/null|undefined/);
  });

  it('팀이 정해지지 않은 쪽은 자리 이름으로 보여 준다', async () => {
    const items = [fx(1, 'fld1', kst(D20, '10:00'), { homeRegistrationId: null, awayRegistrationId: null })];
    scenario.pages = [{ items, nextCursor: null }];
    scenario.fixtures = [{ id: 'f1', homeTeamName: 'TBD', awayTeamName: null, homeSlotLabel: 'A조 1위', awaySlotLabel: null }];
    scenario.staff = [];
    renderBoard();

    expect(await screen.findByRole('article', { name: 'A조 1위 vs 팀 미정' })).toBeInTheDocument();
  });
});
