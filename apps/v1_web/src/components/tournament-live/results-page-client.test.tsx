import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TournamentOpsRoleProvider } from '@/components/tournament-ops/role-context';
import { installViewport } from '@/test/viewport';
import type { V1TournamentStaffRole } from '@/types/api';
import { ResultsPageClient } from './results-page-client';

const nav = vi.hoisted(() => ({ search: '', pathname: '/admin/live/t-1/results' }));

vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ replace: vi.fn(), back: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.search),
}));

// 두 패널은 각자의 테스트가 있다. 여기서는 이 화면이 어느 패널을 어떤 인자로 여는지만 본다.
vi.mock('@/components/tournament-result-review/game-result-review-panel', () => ({
  GameResultReviewPanel: (props: { gameId: string; onOfficialized?: () => void; onSaved?: () => void; correctionsHref?: string }) => (
    <div data-testid="review-panel" data-game={props.gameId} data-corrections-href={props.correctionsHref ?? ''}>
      <button type="button" onClick={() => { props.onOfficialized?.(); props.onSaved?.(); }}>모의 결과 확정</button>
    </div>
  ),
}));
vi.mock('@/components/tournament-result-review/game-result-correction-panel', () => ({
  GameResultCorrectionPanel: (props: { gameId: string; autoOpen?: boolean }) => (
    <div data-testid="correction-panel" data-game={props.gameId} data-auto-open={String(props.autoOpen === true)} />
  ),
}));

const ok = (data: unknown) => HttpResponse.json({ status: 'success', timestamp: 't', data });

interface Row { fixtureId: string; gameId: string; revisionId: string | null; currentRevisionState?: string; fieldName?: string; fixtureNumber?: number; scheduledAt?: string; currentScore?: unknown; warnings?: string[] }
let pages: Array<{ items: Row[]; nextCursor: string | null }>;
let revisionStates: Record<string, string>;
let fixtures: unknown[];
let tournamentKind: 'regular_tournament' | 'regular_league' | undefined;
let liveWarnings: Array<{ fixtureId: string; warnings: string[] }>;
const requestedCursors: Array<string | null> = [];

const server = setupServer(
  http.get('*/api/v1/tournament-ops/tournaments/:id/operations', ({ request }) => {
    const cursor = new URL(request.url).searchParams.get('cursor');
    requestedCursors.push(cursor);
    const page = pages[cursor === null ? 0 : Number(cursor.replace('c', ''))];
    return ok({ items: page.items.map(baseItem), nextCursor: page.nextCursor, watermark: 'w', liveWarnings });
  }),
  http.get('*/api/v1/tournaments/:id', () => ok({ id: 't-1', title: '겨울 풋살컵', ...(tournamentKind === undefined ? {} : { kind: tournamentKind }), fixtures, leagueFixtures: [] })),
  http.get('*/api/v1/games/:gameId/result-revisions', ({ params }) => ok([{ id: `rv-${String(params.gameId)}`, state: revisionStates[String(params.gameId)] ?? 'OFFICIAL' }])),
);

function baseItem(row: Row) {
  return {
    tournamentId: 't-1', round: '조별리그 1라운드', legNumber: null, groupName: 'A조', gameState: 'ENDED', fieldId: 'fld1', homeRegistrationId: 'rh', awayRegistrationId: 'ra',
    warnings: [], version: 1, stableRevision: 's', currentScore: null, scheduledAt: '2026-12-20T00:30:00.000Z', fieldName: '구장 2', fixtureNumber: 7, ...row,
  };
}

const fixtureNames = (n: number, home: string, away: string) => ({ id: `f${n}`, homeTeamName: home, awayTeamName: away, homeSlotLabel: null, awaySlotLabel: null });

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

let restoreViewport: () => void;
beforeEach(() => {
  nav.search = '';
  nav.pathname = '/admin/live/t-1/results';
  requestedCursors.length = 0;
  tournamentKind = 'regular_tournament';
  liveWarnings = [];
  restoreViewport = installViewport(1280);
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  pages = [
    {
      items: [
        { fixtureId: 'f1', gameId: 'g1', revisionId: null },
        { fixtureId: 'f2', gameId: 'g2', revisionId: 'r2', fieldName: '구장 1', fixtureNumber: 1, scheduledAt: '2026-12-20T00:00:00.000Z', currentScore: { home: 2, away: 1 } },
      ],
      nextCursor: null,
    },
  ];
  revisionStates = { g1: 'SUBMITTED', g2: 'OFFICIAL' };
  fixtures = [fixtureNames(1, '노원 킥스', '강서 드리블러'), fixtureNames(2, '잠실 레전드', '마포 FS')];
});
afterEach(() => restoreViewport());

function renderPage(role: V1TournamentStaffRole = 'PLATFORM_OPS') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TournamentOpsRoleProvider role={role}>
        <ResultsPageClient tournamentId="t-1" />
      </TournamentOpsRoleProvider>
    </QueryClientProvider>,
  );
}

describe('ResultsPageClient', () => {
  it('끝난 경기를 확정 대기와 확정됨 두 묶음으로 보여 주고, 점수는 확정됨 줄에만 둔다', async () => {
    renderPage();

    const pendingSection = await screen.findByRole('region', { name: '확정 대기 1' });
    const confirmedSection = screen.getByRole('region', { name: '확정됨 1' });
    expect(screen.getByText('끝난 경기 2')).toBeInTheDocument();
    expect(within(pendingSection).getByText('노원 킥스 vs 강서 드리블러')).toBeInTheDocument();
    expect(within(pendingSection).getByText('확정 대기')).toBeInTheDocument();
    expect(within(pendingSection).getByText('구장 2 · 09:30 · 7번 경기')).toBeInTheDocument();
    expect(within(pendingSection).queryByText(/^\d+:\d+$/)).not.toBeInTheDocument();
    expect(within(confirmedSection).getByText('확정됨')).toBeInTheDocument();
    expect(within(confirmedSection).getByText('2:1')).toBeInTheDocument();
  });

  it('데스크톱에서는 첫 확정 대기 경기가 골라져 확정 패널이 열리고, 확정된 줄은 고치기 패널을 연다', async () => {
    const user = userEvent.setup();
    renderPage();

    const review = await screen.findByTestId('review-panel');
    expect(review).toHaveAttribute('data-game', 'g1');
    expect(review).toHaveAttribute('data-corrections-href', '');
    expect(screen.getByRole('heading', { name: '노원 킥스 vs 강서 드리블러' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /잠실 레전드 vs 마포 FS/ }));

    const correction = await screen.findByTestId('correction-panel');
    expect(correction).toHaveAttribute('data-game', 'g2');
    expect(correction).toHaveAttribute('data-auto-open', 'false');
    expect(screen.getByRole('button', { name: /잠실 레전드 vs 마포 FS/ })).toHaveAttribute('aria-current', 'true');
  });

  it('확정된 경기 딥링크는 고치기 폼을 바로 열지만, 목록에서 직접 누르면 열지 않는다', async () => {
    nav.search = 'fixtureId=f2&from=admin';
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByTestId('correction-panel')).toHaveAttribute('data-auto-open', 'true');

    await user.click(screen.getByRole('button', { name: /노원 킥스 vs 강서 드리블러/ }));
    expect(await screen.findByTestId('review-panel')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /잠실 레전드 vs 마포 FS/ }));
    expect(await screen.findByTestId('correction-panel')).toHaveAttribute('data-auto-open', 'false');
  });

  it('지원(보기만)이 확정된 경기 딥링크로 들어와도 고치기 폼을 바로 열지 않는다', async () => {
    nav.search = 'fixtureId=f2';
    renderPage('SUPPORT_READONLY');

    expect(await screen.findByTestId('correction-panel')).toHaveAttribute('data-auto-open', 'false');
  });

  it('확정된 경기를 고르면 공개 경기 화면 링크가 나오고, 돌아올 주소는 그 경기를 고른 결과 화면이다', async () => {
    nav.search = 'fixtureId=f2';
    renderPage();

    await screen.findByTestId('correction-panel');
    expect(screen.getByRole('link', { name: '공개 화면에서 보기' })).toHaveAttribute(
      'href',
      '/tournaments/t-1/matches/f2?from=%2Fadmin%2Flive%2Ft-1%2Fresults%3FfixtureId%3Df2',
    );
  });

  it('정규 리그는 리그 경기 라우트로 링크한다', async () => {
    tournamentKind = 'regular_league';
    nav.search = 'fixtureId=f2';
    renderPage();

    await screen.findByTestId('correction-panel');
    expect(screen.getByRole('link', { name: '공개 화면에서 보기' })).toHaveAttribute(
      'href',
      '/league-matches/t-1/fixtures/f2?from=%2Fadmin%2Flive%2Ft-1%2Fresults%3FfixtureId%3Df2',
    );
  });

  it('스태프 표면에서는 돌아올 주소도 스태프 결과 화면이다', async () => {
    nav.pathname = '/tournament-ops/tournaments/t-1/results';
    nav.search = 'fixtureId=f2';
    renderPage();

    await screen.findByTestId('correction-panel');
    expect(screen.getByRole('link', { name: '공개 화면에서 보기' })).toHaveAttribute(
      'href',
      '/tournaments/t-1/matches/f2?from=%2Ftournament-ops%2Ftournaments%2Ft-1%2Fresults%3FfixtureId%3Df2',
    );
  });

  it('다른 경기를 고르면 공개 화면의 돌아올 주소도 그 경기로 바뀐다', async () => {
    pages = [
      {
        items: [
          { fixtureId: 'f2', gameId: 'g2', revisionId: 'r2' },
          { fixtureId: 'f3', gameId: 'g3', revisionId: 'r3', fixtureNumber: 3 },
        ],
        nextCursor: null,
      },
    ];
    fixtures = [fixtureNames(2, '잠실 레전드', '마포 FS'), fixtureNames(3, '성수 유나이티드', '한강 FC')];
    nav.search = 'fixtureId=f2';
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId('correction-panel');

    await user.click(screen.getByRole('button', { name: /성수 유나이티드 vs 한강 FC/ }));

    expect(screen.getByRole('link', { name: '공개 화면에서 보기' })).toHaveAttribute(
      'href',
      '/tournaments/t-1/matches/f3?from=%2Fadmin%2Flive%2Ft-1%2Fresults%3FfixtureId%3Df3',
    );
  });

  it('무효 처리된 경기도 공개 화면으로 볼 수 있다', async () => {
    pages = [{ items: [{ fixtureId: 'f3', gameId: 'g3', revisionId: 'r3', currentRevisionState: 'VOID' }], nextCursor: null }];
    fixtures = [fixtureNames(3, '성수 유나이티드', '한강 FC')];
    nav.search = 'fixtureId=f3';
    renderPage();

    await screen.findByTestId('correction-panel');
    expect(screen.getByRole('link', { name: '공개 화면에서 보기' })).toHaveAttribute('href', expect.stringContaining('/tournaments/t-1/matches/f3'));
  });

  it('확정 대기 경기에는 공개 화면 링크가 없다 — 아직 참가자에게 보이는 결과가 없다', async () => {
    renderPage();

    await screen.findByTestId('review-panel');
    expect(screen.queryByRole('link', { name: '공개 화면에서 보기' })).not.toBeInTheDocument();
  });

  it('대회 종류가 아직 안 왔으면 링크를 만들지 않는다 — 리그가 대회 라우트로 링크돼 404 가 되지 않게', async () => {
    tournamentKind = undefined;
    nav.search = 'fixtureId=f2';
    renderPage();

    await screen.findByTestId('correction-panel');
    expect(screen.queryByRole('link', { name: '공개 화면에서 보기' })).not.toBeInTheDocument();
  });

  it('확정 대기 줄에는 득점자 미기재·검토 기한 초과 경고가 글자로 붙고, 확정됨 줄에는 없다', async () => {
    pages = [
      {
        items: [
          { fixtureId: 'f1', gameId: 'g1', revisionId: null, warnings: ['MISSING_SCORER'] },
          { fixtureId: 'f3', gameId: 'g3', revisionId: 'r3', currentRevisionState: 'SUBMITTED', fixtureNumber: 3 },
          { fixtureId: 'f2', gameId: 'g2', revisionId: 'r2', fieldName: '구장 1', fixtureNumber: 1, warnings: ['MISSING_SCORER'] },
        ],
        nextCursor: null,
      },
    ];
    fixtures = [fixtureNames(1, '노원 킥스', '강서 드리블러'), fixtureNames(2, '잠실 레전드', '마포 FS'), fixtureNames(3, '성수 유나이티드', '한강 FC')];
    liveWarnings = [{ fixtureId: 'f3', warnings: ['RESULT_REVIEW_OVERDUE'] }];
    renderPage();

    const pendingSection = await screen.findByRole('region', { name: '확정 대기 2' });
    const row1 = within(pendingSection).getByRole('button', { name: /노원 킥스 vs 강서 드리블러/ });
    const row3 = within(pendingSection).getByRole('button', { name: /성수 유나이티드 vs 한강 FC/ });
    expect(within(row1).getByText('득점자 미기재')).toBeInTheDocument();
    expect(within(row1).queryByText('검토 기한 초과')).not.toBeInTheDocument();
    expect(within(row3).getByText('검토 기한 초과')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: '확정됨 1' })).queryByText('득점자 미기재')).not.toBeInTheDocument();
  });

  it('확정 대기 경기 딥링크는 확정 패널을 연다', async () => {
    nav.search = 'fixtureId=f1';
    renderPage();

    expect(await screen.findByTestId('review-panel')).toHaveAttribute('data-game', 'g1');
    expect(screen.queryByTestId('correction-panel')).not.toBeInTheDocument();
  });

  it('목록에 없는 경기를 딥링크로 받으면 이유를 알려 준다', async () => {
    nav.search = 'fixtureId=nope';
    renderPage();

    expect(await screen.findByRole('status')).toHaveTextContent('전달받은 경기는 지금 목록에 없어요. 아직 끝나지 않았거나 이미 처리됐을 수 있어요.');
    expect(await screen.findByTestId('review-panel')).toHaveAttribute('data-game', 'g1');
  });

  it('결과를 확정하면 안내 문구를 보이고 그 경기를 계속 보여 준다', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: '모의 결과 확정' }));

    expect(await screen.findByText('공식 결과로 확정했어요.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '노원 킥스 vs 강서 드리블러' })).toBeInTheDocument();
  });

  it('옛 용어(정정·결과 검토·고치고 확인)가 화면에 없다', async () => {
    const { container } = renderPage();
    await screen.findByTestId('review-panel');
    expect(container.textContent).not.toMatch(/정정|결과 검토|고치고 확인/);
  });

  it('보드 서버 페이지가 둘(101건)이어도 101번째 경기까지 목록에 있다', async () => {
    const first: Row[] = Array.from({ length: 100 }, (_, i) => ({ fixtureId: `f${i + 1}`, gameId: `g${i + 1}`, revisionId: `r${i + 1}`, fixtureNumber: i + 1 }));
    pages = [{ items: first, nextCursor: 'c1' }, { items: [{ fixtureId: 'f101', gameId: 'g101', revisionId: null, fixtureNumber: 101 }], nextCursor: null }];
    fixtures = Array.from({ length: 101 }, (_, i) => fixtureNames(i + 1, `홈${i + 1}`, `원정${i + 1}`));
    renderPage();

    expect(await screen.findByRole('region', { name: '확정됨 100' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '확정 대기 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /홈101 vs 원정101/ })).toBeInTheDocument();
    expect(requestedCursors).toEqual([null, 'c1']);
  });

  it('쪽 사이에 같은 경기가 두 번 와도 한 번만 센다', async () => {
    pages = [
      { items: [{ fixtureId: 'f1', gameId: 'g1', revisionId: null }, { fixtureId: 'f2', gameId: 'g2', revisionId: 'r2' }], nextCursor: 'c1' },
      { items: [{ fixtureId: 'f2', gameId: 'g2', revisionId: 'r2' }], nextCursor: null },
    ];
    renderPage();

    expect(await screen.findByText('끝난 경기 2')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /잠실 레전드 vs 마포 FS/ })).toHaveLength(1);
  });

  it('무효 처리된 결과는 확정 대기도 확정됨도 아닌 「결과 무효」 묶음에 있다', async () => {
    pages = [
      {
        items: [
          { fixtureId: 'f1', gameId: 'g1', revisionId: null },
          { fixtureId: 'f2', gameId: 'g2', revisionId: 'r2', currentRevisionState: 'OFFICIAL' },
          { fixtureId: 'f3', gameId: 'g3', revisionId: 'r3', currentRevisionState: 'VOID' },
        ],
        nextCursor: null,
      },
    ];
    fixtures = [fixtureNames(1, '노원 킥스', '강서 드리블러'), fixtureNames(2, '잠실 레전드', '마포 FS'), fixtureNames(3, '성수 유나이티드', '한강 FC')];
    renderPage();

    const voidSection = await screen.findByRole('region', { name: '결과 무효 1' });
    expect(within(voidSection).getByText('성수 유나이티드 vs 한강 FC')).toBeInTheDocument();
    expect(within(voidSection).getByText('결과 무효')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: '확정 대기 1' })).queryByText('성수 유나이티드 vs 한강 FC')).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: '확정됨 1' })).queryByText('성수 유나이티드 vs 한강 FC')).not.toBeInTheDocument();
    expect(screen.getByText('끝난 경기 3')).toBeInTheDocument();
  });

  it('무효 결과가 없으면 결과 무효 묶음을 그리지 않는다', async () => {
    renderPage();
    await screen.findByRole('region', { name: '확정 대기 1' });
    expect(screen.queryByRole('region', { name: /결과 무효/ })).not.toBeInTheDocument();
  });

  it('지원도 목록과 패널을 보고, 확정·고치기는 못 한다는 이유를 읽는다', async () => {
    renderPage('SUPPORT_READONLY');

    expect(await screen.findByTestId('review-panel')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '확정 대기 1' })).toBeInTheDocument();
    expect(screen.getByText('보기만 할 수 있어요. 결과 확정·고치기는 대회 운영자·플랫폼 운영자만 할 수 있어요.')).toBeInTheDocument();
    // 이 화면 자체의 확정·고치기 버튼은 없다(패널 안 버튼은 패널이 권한으로 숨긴다).
    expect(screen.queryByRole('button', { name: '결과 확정' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '결과 고치기' })).not.toBeInTheDocument();
  });

  it('운영자에게는 읽기 전용 안내가 없다', async () => {
    renderPage('TOURNAMENT_DIRECTOR');
    await screen.findByTestId('review-panel');
    expect(screen.queryByText(/보기만 할 수 있어요/)).not.toBeInTheDocument();
  });

  it('확정 대기가 없으면 알리고 운영 보드로 가는 길을 준다', async () => {
    pages = [{ items: [{ fixtureId: 'f2', gameId: 'g2', revisionId: 'r2' }], nextCursor: null }];
    renderPage();

    const pendingSection = await screen.findByRole('region', { name: '확정 대기 0' });
    expect(within(pendingSection).getByText('지금 확정할 결과가 없어요')).toBeInTheDocument();
    expect(within(pendingSection).getByRole('link', { name: '운영 보드로 가기' })).toHaveAttribute('href', '/admin/live/t-1/operations');
  });

  it('끝난 경기가 하나도 없으면 그 사실을 알린다', async () => {
    pages = [{ items: [], nextCursor: null }];
    renderPage();

    expect(await screen.findByText('아직 끝난 경기가 없어요')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '운영 보드로 가기' })).toHaveAttribute('href', '/admin/live/t-1/operations');
  });

  it('스태프 표면에서는 링크가 스태프 주소를 쓴다', async () => {
    nav.pathname = '/tournament-ops/tournaments/t-1/results';
    pages = [{ items: [], nextCursor: null }];
    renderPage();

    expect(await screen.findByRole('link', { name: '운영 보드로 가기' })).toHaveAttribute('href', '/tournament-ops/tournaments/t-1/operations');
  });
});

describe('ResultsPageClient — 폰', () => {
  beforeEach(() => {
    restoreViewport();
    restoreViewport = installViewport(390);
  });

  it('목록에 없는 경기를 딥링크로 받으면 패널 대신 목록과 이유를 보여 준다', async () => {
    nav.search = 'fixtureId=nope';
    renderPage();

    expect(await screen.findByRole('status')).toHaveTextContent('전달받은 경기는 지금 목록에 없어요');
    expect(screen.getByRole('region', { name: '확정 대기 1' })).toBeInTheDocument();
    expect(screen.queryByTestId('review-panel')).not.toBeInTheDocument();
  });

  it('목록에서 줄을 누르면 패널만 보이고, 목록으로 돌아올 수 있다', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('region', { name: '확정 대기 1' });
    expect(screen.queryByTestId('review-panel')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '목록으로' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /노원 킥스 vs 강서 드리블러/ }));

    expect(await screen.findByTestId('review-panel')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '확정 대기 1' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '목록으로' }));
    await waitFor(() => expect(screen.getByRole('region', { name: '확정 대기 1' })).toBeInTheDocument());
    expect(screen.queryByTestId('review-panel')).not.toBeInTheDocument();
  });

  it('딥링크로 들어오면 바로 패널이 열린다', async () => {
    nav.search = 'fixtureId=f2';
    renderPage();

    expect(await screen.findByTestId('correction-panel')).toHaveAttribute('data-auto-open', 'true');
    expect(screen.getByRole('button', { name: '목록으로' })).toBeInTheDocument();
  });
});
