/**
 * 경기 명단 관리(Task 179 팀 B·C) — 실제 훅이 MSW 상태형 서버에 보내는 요청과 그 결과 화면을 본다.
 * 칩 토글이 어떤 일괄 요청이 되는지, 시작된 경기 409 에서 무엇이 남는지, 결장 기간이 어떤 기간으로 나가는지.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createV1GameRosterMswHandlers, GAME_ROSTER_MSW } from '@/test/msw/game-roster-handlers';
import { TeamGameRostersClient } from './team-game-rosters-client';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/teams/team-1/game-rosters',
}));

const { teamId } = GAME_ROSTER_MSW;
const [G1, G2] = GAME_ROSTER_MSW.games;
const NOW = '2026-10-01T00:00:00.000Z';
const BATCH = `/api/v1/teams/${teamId}/game-rosters/batch`;
const clients: QueryClient[] = [];

let mock: ReturnType<typeof createV1GameRosterMswHandlers>;
let server: ReturnType<typeof setupServer>;

beforeEach(() => {
  // The form defaults to today; keep the fixture clock distinct from the saved interval.
  // Only Date is fake so MSW and Testing Library polling still use real timers.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  mock = createV1GameRosterMswHandlers();
  server = setupServer(
    ...mock.handlers,
    http.get('*/api/v1/teams/:requestedTeamId', ({ params }) => {
      if (params.requestedTeamId !== teamId) return new HttpResponse(null, { status: 404 });
      return HttpResponse.json({ status: 'success', data: { teamId, name: '현재 경로의 합성 팀' }, timestamp: NOW });
    }),
    http.get('*/api/v1/auth/me', () =>
      HttpResponse.json({ status: 'success', data: { user: { id: GAME_ROSTER_MSW.viewerUserId } }, timestamp: NOW }),
    ),
    http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })),
  );
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  server.close();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(queryClient);
  return render(
    <QueryClientProvider client={queryClient}>
      <TeamGameRostersClient teamId={teamId} />
    </QueryClientProvider>,
  );
}

async function playerCard(name: string) {
  const group = await screen.findByRole('group', { name: `${name} 경기별 출전` });
  return group.closest('.tm-card') as HTMLElement;
}

function batchBodies() {
  return mock.requests.filter((r) => r.method === 'POST' && r.path === BATCH).map((r) => r.body);
}

describe('경기 명단 관리 — 칩 토글과 일괄 저장', () => {
  it('칩을 누르면 그 경기 빠짐이 한 건 일괄 요청으로 저장되고, 표가 새 상태를 보인다', async () => {
    renderPage();
    const card = within(await playerCard('김민재'));
    expect(card.getByText('전부 출전')).toBeInTheDocument();

    fireEvent.click(card.getByRole('button', { name: /^10\/4 마포 FC 출전, 누르면 빠져요/ }));
    fireEvent.click(screen.getByRole('button', { name: '변경 1건 저장' }));

    await screen.findByText('변경 1건을 저장했어요.');
    expect(batchBodies()).toEqual([{ changes: [{ gameId: G1.gameId, userId: 'player-1', op: 'EXCLUDE' }] }]);
    const after = within(await playerCard('김민재'));
    await waitFor(() => expect(after.getByRole('button', { name: /^10\/4 마포 FC 빠짐, 누르면 출전으로/ })).toBeInTheDocument());
    // 다른 경기·다른 선수는 그대로 출전이다.
    expect(after.getByRole('button', { name: /^10\/11 강남 유나이티드 출전/ })).toBeInTheDocument();
    expect(within(await playerCard('박서준')).getByText('전부 출전')).toBeInTheDocument();
  });

  it('같은 칩을 두 번 누르면 변경이 사라져 저장할 게 없다', async () => {
    renderPage();
    const card = within(await playerCard('김민재'));
    const chip = card.getByRole('button', { name: /^10\/4 마포 FC 출전/ });
    fireEvent.click(chip);
    expect(screen.getByRole('button', { name: '변경 1건 저장' })).toBeEnabled();
    fireEvent.click(card.getByRole('button', { name: /^10\/4 마포 FC 빠짐\(저장 전\)/ }));
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();
  });

  it('빠진 선수를 되돌리면 REVOKE 로 나간다', async () => {
    mock.excludeAsTeamManager(G2.gameId, 'player-2', 'INJURY');
    renderPage();
    const card = within(await playerCard('박서준'));
    expect(card.getByText('부상 · 1경기 빠짐')).toBeInTheDocument();

    fireEvent.click(card.getByRole('button', { name: /^10\/11 강남 유나이티드 빠짐, 누르면 출전으로/ }));
    fireEvent.click(screen.getByRole('button', { name: '변경 1건 저장' }));

    await screen.findByText('변경 1건을 저장했어요.');
    expect(batchBodies()).toEqual([{ changes: [{ gameId: G2.gameId, userId: 'player-2', op: 'REVOKE' }] }]);
  });

  it('출전정지 선수의 칩은 누를 수 없고 배지로 남은 경기를 보인다', async () => {
    mock.suspend('player-3', '레드카드', 1);
    renderPage();
    const card = within(await playerCard('한도윤'));
    expect(card.getByText('출전정지 1경기')).toBeInTheDocument();
    for (const chip of card.getAllByRole('button', { name: /출전정지/ })) expect(chip).toBeDisabled();
  });

  it('그사이 시작된 경기가 섞이면 409 — 그 경기 변경만 빠지고 나머지를 다시 저장할 수 있다', async () => {
    renderPage();
    const card = within(await playerCard('김민재'));
    fireEvent.click(card.getByRole('button', { name: /^10\/4 마포 FC 출전/ }));
    fireEvent.click(card.getByRole('button', { name: /^10\/11 강남 유나이티드 출전/ }));
    mock.setGameState(G1.gameId, 'LIVE');

    fireEvent.click(screen.getByRole('button', { name: '변경 2건 저장' }));
    await screen.findByText(/그사이 시작된 경기가 있어 저장하지 못했어요/);
    await waitFor(() => expect(screen.getByRole('button', { name: '변경 1건 저장' })).toBeEnabled());
    // 시작된 경기 칩은 이제 누를 수 없다.
    expect(within(await playerCard('김민재')).getByRole('button', { name: /^10\/4 마포 FC 출전/ })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '변경 1건 저장' }));
    await screen.findByText('변경 1건을 저장했어요.');
    expect(batchBodies().at(-1)).toEqual({ changes: [{ gameId: G2.gameId, userId: 'player-1', op: 'EXCLUDE' }] });
  });

  it('대진이 바뀌어 우리 팀 경기가 아니게 되면(404) 그 경기 변경만 빼고 표를 다시 받는다', async () => {
    renderPage();
    const card = within(await playerCard('김민재'));
    fireEvent.click(card.getByRole('button', { name: /^10\/4 마포 FC 출전/ }));
    fireEvent.click(card.getByRole('button', { name: /^10\/11 강남 유나이티드 출전/ }));
    mock.detachGame(G1.gameId);
    const matrixGets = () => mock.requests.filter((r) => r.method === 'GET' && r.path.endsWith('/game-rosters')).length;
    const before = matrixGets();

    fireEvent.click(screen.getByRole('button', { name: '변경 2건 저장' }));
    await screen.findByText(/대진이 바뀌어 이 팀이 뛰지 않게 된 경기가 있어요/);
    await waitFor(() => expect(matrixGets()).toBe(before + 1));
    await waitFor(() => expect(screen.queryByRole('button', { name: /10\/4 마포 FC/ })).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: '변경 1건 저장' }));
    await screen.findByText('변경 1건을 저장했어요.');
    expect(batchBodies().at(-1)).toEqual({ changes: [{ gameId: G2.gameId, userId: 'player-1', op: 'EXCLUDE' }] });
  });

  it('열어 둔 사이 권한이 바뀌면(403) 표를 다시 받아 보기 전용이 된다', async () => {
    renderPage();
    fireEvent.click(within(await playerCard('김민재')).getByRole('button', { name: /^10\/4 마포 FC 출전/ }));
    mock.setCanWrite(false);

    fireEvent.click(screen.getByRole('button', { name: '변경 1건 저장' }));
    await screen.findByText('팀장·매니저만 경기 명단을 바꿀 수 있어요.');
    await waitFor(() => expect(screen.queryByRole('button', { name: /저장/ })).toBeNull());
    expect(within(await playerCard('김민재')).getByRole('button', { name: /^10\/4 마포 FC 출전/ })).toBeDisabled();
  });

  it('팀원은 표를 받지 못하고 팀장에게 알리라는 안내를 본다', async () => {
    mock.setViewerRole('TEAM_MEMBER');
    renderPage();
    expect(await screen.findByText('팀장·매니저만 볼 수 있어요')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /저장/ })).toBeNull();
  });
});

describe('경기 명단 관리 — 칩 이름', () => {
  it('같은 날 같은 상대 경기는 시각을 붙여 가르고, 그날 하나뿐인 경기는 날짜만 둔다', async () => {
    const game = (gameId: string, scheduledAt: string) => ({
      gameId,
      sideId: `${gameId}-side`,
      teamMatchId: `${gameId}-tm`,
      competitionId: 'cup-1',
      competitionKind: 'TOURNAMENT',
      competitionTitle: '성수 풋살컵',
      opponentName: '마포 FC',
      scheduledAt,
      gameState: 'SCHEDULED',
      editable: true,
      summary: { participating: 1, excluded: 0, unavailable: 0, suspended: 0 },
    });
    const games = [
      game('day-1-am', '2026-10-15T01:00:00.000Z'),
      game('day-1-pm', '2026-10-15T05:00:00.000Z'),
      game('day-2', '2026-10-16T01:00:00.000Z'),
    ];
    const cell = (gameId: string) => ({
      gameId,
      status: 'PARTICIPATING',
      reason: null,
      actorRole: null,
      adjustmentId: null,
      unavailabilityId: null,
      remainingMatches: null,
    });
    server.use(
      http.get('*/api/v1/teams/:teamId/game-rosters', () =>
        HttpResponse.json({
          status: 'success',
          data: {
            teamId,
            viewerRole: 'TEAM_MANAGER',
            games,
            players: [{ userId: 'solo', displayName: '혼자', accountLinked: true, cells: games.map((g) => cell(g.gameId)) }],
          },
          timestamp: NOW,
        }),
      ),
    );
    renderPage();
    const group = await screen.findByRole('group', { name: '혼자 경기별 출전' });
    expect(within(group).getAllByRole('button').map((chip) => chip.textContent)).toEqual([
      '10/15 10:00 마포 FC',
      '10/15 14:00 마포 FC',
      '10/16 마포 FC',
    ]);
  });
});

describe('경기 명단 관리 — 칩 접근성', () => {
  // 칩이 인라인으로 거는 색 토큰을 globals.css 의 라이트·다크 값으로 풀어 대비를 잰다.
  const css = readFileSync(resolve(process.cwd(), 'src/app/globals.css'), 'utf8');
  const block = (selector: RegExp) => {
    const start = css.search(selector);
    return css.slice(start, css.indexOf('\n}', start));
  };
  const light = block(/^:root\s*\{/m);
  const palettes = { light: [light], dark: [block(/^:root\.dark\s*\{/m), light] };
  /** `var(--x)` → hex. 별칭(var 체인)을 따라가고, 다크에 없는 토큰은 :root 값을 물려받는다. */
  const tokenHex = (blocks: string[], value: string): string | undefined => {
    const name = /^var\((--[\w-]+)\)$/.exec(value)?.[1];
    if (name === undefined) return /^#[0-9a-fA-F]{6}$/.test(value) ? value : undefined;
    for (const palette of blocks) {
      const declared = new RegExp(`${name}:\\s*([^;]+);`).exec(palette)?.[1].trim();
      if (declared !== undefined) return tokenHex(blocks, declared);
    }
    return undefined;
  };
  const luminance = (hex: string) =>
    [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  const contrast = (a: string, b: string) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  it('빠진 칩 글자는 라이트·다크 모두 배경 대비 4.5:1 을 넘는다', async () => {
    mock.excludeAsTeamManager(G1.gameId, 'player-1', null);
    renderPage();
    const chip = within(await playerCard('김민재')).getByRole('button', { name: /^10\/4 마포 FC 빠짐/ });
    for (const [mode, palette] of Object.entries(palettes)) {
      const fg = tokenHex(palette, chip.style.color);
      const bg = tokenHex(palette, chip.style.background);
      expect(fg, `${mode} 글자 토큰`).toBeDefined();
      expect(bg, `${mode} 배경 토큰`).toBeDefined();
      expect(contrast(fg as string, bg as string), mode).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('저장 전 칩은 점선 테두리로 표시하고 outline(포커스 링 자리)은 건드리지 않는다', async () => {
    renderPage();
    const card = within(await playerCard('김민재'));
    fireEvent.click(card.getByRole('button', { name: /^10\/4 마포 FC 출전/ }));
    const changed = card.getByRole('button', { name: /^10\/4 마포 FC 빠짐\(저장 전\)/ });
    expect(changed.style.borderStyle).toBe('dashed');
    expect(changed.style.outline).toBe('');
    expect(changed.style.outlineStyle).toBe('');
    // 대조군: 저장된 칩에는 점선이 없다.
    expect(card.getByRole('button', { name: /^10\/11 강남 유나이티드 출전/ }).style.borderStyle).toBe('');
  });
});

describe('경기 명단 관리 — 결장 기간 시트(팀 C)', () => {
  it('KST 날짜 기간·사유로 등록하고, 영향 경기 수를 미리 알려 주며, 등록 뒤 표가 결장으로 바뀐다', async () => {
    renderPage();
    const card = within(await playerCard('박서준'));
    fireEvent.click(card.getByRole('button', { name: '박서준 결장 기간' }));

    const dialog = within(await screen.findByRole('dialog', { name: '결장 기간 · 박서준' }));
    fireEvent.change(dialog.getByLabelText('시작일'), { target: { value: '2026-10-03' } });
    fireEvent.change(dialog.getByLabelText('마지막 날'), { target: { value: '2026-10-12' } });
    expect(dialog.getByText(/이 기간 대회·리그 경기 2개에서 빠져요/)).toBeInTheDocument();
    // L19 — 친선은 자동으로 빠지지 않는다는 것을 같은 안내에서 밝힌다(결장 배지만 붙는다).
    expect(dialog.getByText(/친선 경기는 자동으로 빠지지 않고, 참석명단에 결장 배지만 붙어요/)).toBeInTheDocument();
    fireEvent.change(dialog.getByLabelText('마지막 날'), { target: { value: '2026-10-05' } });
    expect(dialog.getByText(/이 기간 대회·리그 경기 1개에서 빠져요/)).toBeInTheDocument();

    // 사유 칩 줄은 화면에 보이는 라벨로 이름이 붙는다(스크린리더 전용 aria-label 이 아니라).
    const reasons = dialog.getByRole('group', { name: '사유 (선택)' });
    expect(reasons).not.toHaveAttribute('aria-label');
    expect(document.getElementById(reasons.getAttribute('aria-labelledby') ?? '')).toBeVisible();
    fireEvent.click(within(reasons).getByRole('button', { name: '부상' }));
    fireEvent.click(dialog.getByRole('button', { name: '결장 등록' }));

    await dialog.findByText('결장 기간을 등록했어요.');
    const post = mock.requests.find((r) => r.method === 'POST' && r.path.endsWith('/members/player-2/unavailability'));
    // 시작일 KST 0시(포함) ~ 마지막 날 다음 KST 0시(미포함).
    expect(post?.body).toEqual({ startsAt: '2026-10-02T15:00:00.000Z', endsAt: '2026-10-05T15:00:00.000Z', reason: 'INJURY' });
    expect(await dialog.findByRole('button', { name: /결장 취소$/ })).toBeInTheDocument();
    await waitFor(() =>
      expect(within(screen.getByRole('group', { name: '박서준 경기별 출전' })).getByRole('button', { name: /^10\/4 마포 FC 결장/ })).toBeDisabled(),
    );
  });

  it('마지막 날이 시작일보다 앞이면 등록을 막는다', async () => {
    renderPage();
    fireEvent.click(within(await playerCard('김민재')).getByRole('button', { name: '김민재 결장 기간' }));
    const dialog = within(await screen.findByRole('dialog'));
    fireEvent.change(dialog.getByLabelText('시작일'), { target: { value: '2026-10-10' } });
    fireEvent.change(dialog.getByLabelText('마지막 날'), { target: { value: '2026-10-03' } });
    expect(dialog.getByText('마지막 날은 시작일과 같거나 뒤여야 해요.')).toBeInTheDocument();
    expect(dialog.getByRole('button', { name: '결장 등록' })).toBeDisabled();
  });
});

describe('경기 명단 관리 — 결장 기간 시트 등록·취소 뒤 상태', () => {
  async function openSheet() {
    renderPage();
    fireEvent.click(within(await playerCard('박서준')).getByRole('button', { name: '박서준 결장 기간' }));
    return within(await screen.findByRole('dialog', { name: '결장 기간 · 박서준' }));
  }

  async function register(dialog: ReturnType<typeof within>, from: string, to: string, message: string) {
    fireEvent.change(dialog.getByLabelText('시작일'), { target: { value: from } });
    fireEvent.change(dialog.getByLabelText('마지막 날'), { target: { value: to } });
    fireEvent.click(dialog.getByRole('button', { name: '결장 등록' }));
    await dialog.findByText(message);
  }

  it('시작일·마지막 날 입력은 연도를 4자리로 제한하면서 마지막 날 min(시작일)을 유지한다', async () => {
    const dialog = await openSheet();

    expect(dialog.getByLabelText('시작일')).toHaveAttribute('max', '9999-12-31');
    const end = dialog.getByLabelText('마지막 날');
    expect(end).toHaveAttribute('max', '9999-12-31');
    fireEvent.change(dialog.getByLabelText('시작일'), { target: { value: '2026-10-03' } });
    expect(end).toHaveAttribute('min', '2026-10-03');
  });

  it('등록에 성공하면 사유·날짜가 초기값으로 돌아와 방금 등록한 기간이 폼에 남지 않는다', async () => {
    const dialog = await openSheet();
    const defaultStart = (dialog.getByLabelText('시작일') as HTMLInputElement).value;
    const defaultEnd = (dialog.getByLabelText('마지막 날') as HTMLInputElement).value;
    expect(defaultStart).not.toBe('2026-10-03');
    fireEvent.click(dialog.getByRole('button', { name: '부상' }));

    await register(dialog, '2026-10-03', '2026-10-05', '결장 기간을 등록했어요.');

    expect(dialog.getByLabelText('시작일')).toHaveValue(defaultStart);
    expect(dialog.getByLabelText('마지막 날')).toHaveValue(defaultEnd);
    expect(dialog.getByRole('button', { name: '부상' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('겹치는 다른 결장 기간이 남아 있으면 취소 문구가 그 경기는 계속 빠진다고 알린다', async () => {
    const dialog = await openSheet();
    await register(dialog, '2026-10-03', '2026-10-05', '결장 기간을 등록했어요.');
    await register(dialog, '2026-10-04', '2026-10-08', '결장 기간을 등록했어요.');
    await waitFor(() => expect(dialog.getAllByRole('button', { name: /결장 취소$/ })).toHaveLength(2));

    fireEvent.click(dialog.getAllByRole('button', { name: /결장 취소$/ })[0]);

    expect(await dialog.findByText('결장 기간을 취소했어요. 다른 결장 기간에 걸린 경기는 계속 빠져요.')).toBeInTheDocument();
    await waitFor(() => expect(dialog.getAllByRole('button', { name: /결장 취소$/ })).toHaveLength(1));
  });

  it('겹치지 않는 기간만 남았으면 취소한 기간 경기가 다시 출전으로 돌아간다고 알린다', async () => {
    const dialog = await openSheet();
    await register(dialog, '2026-10-03', '2026-10-05', '결장 기간을 등록했어요.');
    await register(dialog, '2026-10-20', '2026-10-22', '결장 기간을 등록했어요.');
    await waitFor(() => expect(dialog.getAllByRole('button', { name: /결장 취소$/ })).toHaveLength(2));

    fireEvent.click(dialog.getAllByRole('button', { name: /결장 취소$/ })[0]);

    expect(await dialog.findByText('결장 기간을 취소했어요. 그 기간 경기에 다시 출전으로 들어가요.')).toBeInTheDocument();
    await waitFor(() => expect(dialog.getAllByRole('button', { name: /결장 취소$/ })).toHaveLength(1));
  });
});
