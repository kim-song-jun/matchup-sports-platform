import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import postcss from 'postcss';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShellFrame } from '@/components/v1-ui/app-shell-frame';
import { EmptyState } from '@/components/v1-ui/primitives';
import { __resetNavigationHistoryForTests } from '@/lib/navigation-history';
import { createV1GameRosterMswHandlers, GAME_ROSTER_MSW } from '@/test/msw/game-roster-handlers';
import { TeamGameRostersClient } from './team-game-rosters-client';
import rosterStyles from './team-game-rosters.module.css';

const navigation = vi.hoisted(() => ({ replace: vi.fn(), back: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/teams/team-1/game-rosters',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ ...navigation, prefetch: vi.fn() }),
}));

const { teamId } = GAME_ROSTER_MSW;
const TEAM_NAME = '현재 경로의 합성 팀';
const PAGE_TITLE = '경기 명단 관리';
const NOW = '2026-10-01T00:00:00.000Z';
const mobileListCss = postcss.parse(readFileSync(resolve('src/app/globals.css'), 'utf8')).nodes
  .filter((node) => node.type === 'rule' && ['.tm-team-list', '.tm-empty-state'].includes(node.selector))
  .map((node) => node.toString()).join('\n');
// Vitest의 css:false 대신 실제 module 원문을 실제 export 클래스에 연결해 규칙을 적용한다.
const rosterCss = postcss.parse(readFileSync(resolve('src/app/teams/[id]/game-rosters/team-game-rosters.module.css'), 'utf8'));
rosterCss.walkRules((rule) => { rule.selector = rule.selector.replace(/\.body\b/g, `.${rosterStyles.body}`); });
const desktopCss = `${mobileListCss}\n${readFileSync(resolve('src/app/desktop/_shell.css'), 'utf8')}\n${readFileSync(resolve('src/app/desktop/teams.css'), 'utf8')}\n${rosterCss.toString()}`;
const clients: QueryClient[] = [];
let mock: ReturnType<typeof createV1GameRosterMswHandlers>;
let server: ReturnType<typeof setupServer>;
let viewportStyle: HTMLStyleElement | undefined;
let teamName = TEAM_NAME;
let teamInfoFails = false;
let teamInfoPending = false;
let teamInfoGets = 0;
let releaseTeamInfo: (() => void) | undefined;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  teamName = TEAM_NAME;
  teamInfoFails = false;
  teamInfoPending = false;
  teamInfoGets = 0;
  releaseTeamInfo = undefined;
  navigation.replace.mockClear();
  navigation.back.mockClear();
  navigation.push.mockClear();
  __resetNavigationHistoryForTests();
  mock = createV1GameRosterMswHandlers();
  server = setupServer(
    ...mock.handlers,
    http.get('*/api/v1/teams/:requestedTeamId', async ({ params }) => {
      teamInfoGets += 1;
      if (params.requestedTeamId !== teamId) return new HttpResponse(null, { status: 404 });
      if (teamInfoPending) await new Promise<void>((resolveResponse) => { releaseTeamInfo = resolveResponse; });
      if (teamInfoFails) return HttpResponse.json({ status: 'error', statusCode: 503, message: '팀 정보 조회 실패' }, { status: 503 });
      return HttpResponse.json({ status: 'success', data: { teamId, name: teamName }, timestamp: NOW });
    }),
    http.get('*/api/v1/auth/me', () => HttpResponse.json({ status: 'success', data: { user: { id: GAME_ROSTER_MSW.viewerUserId } }, timestamp: NOW })),
    http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })),
  );
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  releaseTeamInfo?.();
  cleanup();
  viewportStyle?.remove();
  viewportStyle = undefined;
  for (const client of clients.splice(0)) client.clear();
  server.close();
  __resetNavigationHistoryForTests();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

function renderAtWidth(width: number) {
  // jsdom은 media query를 적용하지 않아 실제 stylesheet의 너비 조건만 펼쳐요.
  // 표시·숨김 규칙을 복제하지 않으므로 원본 breakpoint가 깨지면 테스트도 실패해요.
  const css = postcss.parse(desktopCss);
  css.walkAtRules('media', (rule) => {
    const min = rule.params.match(/min-width:\s*(\d+)px/);
    const max = rule.params.match(/max-width:\s*(\d+)px/);
    const applies = (min || max) && (!min || width >= Number(min[1])) && (!max || width <= Number(max[1]));
    if (applies) rule.replaceWith(...(rule.nodes ?? []));
    else rule.remove();
  });
  viewportStyle = document.createElement('style');
  viewportStyle.textContent = css.toString();
  document.head.append(viewportStyle);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}><AppShellFrame><TeamGameRostersClient teamId={teamId} /></AppShellFrame></QueryClientProvider>);
}

function emptyRoster() {
  server.use(http.get('*/api/v1/teams/:requestedTeamId/game-rosters', ({ params }) => {
    if (params.requestedTeamId !== teamId) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json({ status: 'success', data: { teamId, viewerRole: 'TEAM_MANAGER', games: [], players: [] }, timestamp: NOW });
  }));
}

function horizontalPadding(element: Element) {
  // jsdom은 var/calc가 있는 padding shorthand를 버린다. 실제 활성 CSS 선언을 비교한다.
  // 좌표·레이아웃 계산이나 토큰 값 대체를 하지 않으며 브라우저 픽셀 증거를 대신하지 않는다.
  const inset = { start: '0px', end: '0px' };
  const zero = (value: string) => value === '0' ? '0px' : value;
  const apply = (declaration: postcss.Declaration) => {
    const values = postcss.list.space(declaration.value);
    if (declaration.prop === 'padding') {
      inset.start = zero(values[3] ?? values[1] ?? values[0]);
      inset.end = zero(values[1] ?? values[0]);
    } else if (declaration.prop === 'padding-inline') {
      inset.start = zero(values[0]); inset.end = zero(values[1] ?? values[0]);
    } else if (declaration.prop === 'padding-left' || declaration.prop === 'padding-inline-start') {
      inset.start = zero(values[0]);
    } else if (declaration.prop === 'padding-right' || declaration.prop === 'padding-inline-end') {
      inset.end = zero(values[0]);
    }
  };
  postcss.parse(viewportStyle?.textContent ?? '').walkRules((rule) => {
    if (element.matches(rule.selector)) rule.walkDecls(apply);
  });
  postcss.parse(`.inline { ${element.getAttribute('style') ?? ''} }`).walkDecls(apply);
  return inset;
}

function serializedParagraph(text: string) {
  const client = clients.at(-1);
  if (!client) throw new Error('실제 응답을 받은 QueryClient가 없어요.');
  // 실제 HTTP로 채운 cache를 같은 consumer에서 직렬화해 ReactDOM/jsdom이 버린 CSS 값을 보존한다.
  const markup = renderToStaticMarkup(<QueryClientProvider client={client}><AppShellFrame><TeamGameRostersClient teamId={teamId} /></AppShellFrame></QueryClientProvider>);
  const document = new DOMParser().parseFromString(markup, 'text/html');
  const paragraph = Array.from(document.querySelectorAll('p')).find((node) => node.textContent === text);
  if (!paragraph) throw new Error('직렬화된 실제 본문 문구가 없어요.');
  return paragraph;
}

describe('QA51 실제 route consumer·셸·CSS의 명단 관리 맥락', () => {
  it.each([390, 768, 1188, 1440])('%spx 빈 명단은 공유 빈 상태의 세로 간격과 너비를 보존한다', async (width) => {
    emptyRoster();
    renderAtWidth(width);
    const empty = (await screen.findByText('다가오는 대회·리그 경기가 없어요')).closest('.tm-empty-state');
    render(<EmptyState title="공유 빈 상태 기준" sub="기본 빈 상태 간격을 비교해요." />);
    const reference = screen.getByText('공유 빈 상태 기준').closest('.tm-empty-state');
    if (!empty || !reference) throw new Error('실제 소비자 또는 공유 빈 상태가 없어요.');
    expect(empty).toBeVisible();
    // 실제 원본 CSS와 공유 primitive의 계산된 속성을 비교한다. 좌표나 가짜 크기를 넣지 않는다.
    const actualStyle = getComputedStyle(empty);
    const referenceStyle = getComputedStyle(reference);
    expect({
      paddingTop: actualStyle.paddingTop,
      paddingBottom: actualStyle.paddingBottom,
      maxWidth: actualStyle.maxWidth,
      marginLeft: actualStyle.marginLeft,
      marginRight: actualStyle.marginRight,
    }).toEqual({
      paddingTop: referenceStyle.paddingTop,
      paddingBottom: referenceStyle.paddingBottom,
      maxWidth: referenceStyle.maxWidth,
      marginLeft: referenceStyle.marginLeft,
      marginRight: referenceStyle.marginRight,
    });
  });

  it.each([390, 768, 1188, 1440])('%spx 명단 본문 좌우 여백은 모바일 토큰과 데스크톱 헤더 기준을 따른다', async (width) => {
    renderAtWidth(width);
    await screen.findByRole('group', { name: '김민재 경기별 출전' });
    const body = serializedParagraph('다가오는 대회·리그 경기 2개 · 칩을 누르면 그 경기에서 빠져요').parentElement;
    if (!body) throw new Error('실제 명단 본문 컨테이너가 없어요.');
    if (width >= 1024) {
      const heading = await screen.findByRole('heading', { level: 1, name: `${TEAM_NAME} · ${PAGE_TITLE}` });
      const header = heading.closest('.tm-desktop-page-head');
      if (!header) throw new Error('실제 데스크톱 헤더가 없어요.');
      expect(horizontalPadding(body)).toEqual(horizontalPadding(header));
    } else {
      expect(horizontalPadding(body)).toEqual({ start: 'var(--v1-shell-page-x)', end: 'var(--v1-shell-page-x)' });
    }
  });

  it.each([1188, 1440])('%spx 팀 정보 로딩 문구 좌우 여백은 데스크톱 헤더 기준을 따른다', async (width) => {
    teamInfoPending = true;
    renderAtWidth(width);
    await screen.findByRole('group', { name: '김민재 경기별 출전' });
    const loading = screen.getByText('팀 정보를 불러오고 있어요.');
    const header = screen.getByRole('heading', { level: 1, name: PAGE_TITLE }).closest('.tm-desktop-page-head');
    if (!header) throw new Error('실제 데스크톱 헤더가 없어요.');
    expect(loading).toBeVisible();
    expect(horizontalPadding(serializedParagraph('팀 정보를 불러오고 있어요.'))).toEqual(horizontalPadding(header));
  });

  it.each([
    [390, false], [502, false], [768, false], [1188, false], [1440, false],
    [390, true], [502, true], [768, true], [1188, true], [1440, true],
  ] as const)('%spx 경기 유무=%s에서 제목 하나와 현재 팀 복귀를 보존한다', async (width, hasGames) => {
    if (!hasGames) emptyRoster();
    const view = renderAtWidth(width);
    await screen.findByText(`다가오는 대회·리그 경기 ${hasGames ? 2 : 0}개 · 칩을 누르면 그 경기에서 빠져요`);

    if (width >= 1024) {
      expect(await screen.findByRole('heading', { level: 1, name: `${TEAM_NAME} · ${PAGE_TITLE}` })).toBeVisible();
      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    } else {
      expect(view.container.querySelector('.tm-topbar-heading')).toHaveTextContent(PAGE_TITLE);
      expect(view.container.querySelector('.tm-topbar-heading')).toBeVisible();
      expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
      expect(view.container.querySelectorAll('.tm-topbar-heading')).toHaveLength(1);
    }
    const backs = screen.getAllByRole('link', { name: '뒤로가기' });
    expect(backs).toHaveLength(1);
    expect(backs[0]).toHaveAttribute('href', `/teams/${teamId}`);
    fireEvent.click(backs[0]);
    expect(navigation.replace).toHaveBeenCalledWith(`/teams/${teamId}`);
  });

  it('1440px 긴 실제 팀명은 잘리지 않고 줄바꿈할 수 있다', async () => {
    teamName = '공백없는긴팀이름'.repeat(25);
    emptyRoster();
    renderAtWidth(1440);
    const heading = await screen.findByRole('heading', { level: 1, name: `${teamName} · ${PAGE_TITLE}` });
    expect(heading).toBeVisible();
    expect(heading).toHaveStyle({ minWidth: 0, overflowWrap: 'anywhere' });
    expect(heading).not.toHaveStyle({ whiteSpace: 'nowrap', overflow: 'hidden' });
  });

  it.each([[390, 'pending'], [390, '503'], [768, 'pending'], [768, '503']] as const)('%spx에서 보조 팀 정보 %s 상태는 셸과 명단에 노출하지 않는다', async (width, status) => {
    teamInfoPending = status === 'pending';
    teamInfoFails = status === '503';
    const view = renderAtWidth(width);
    await screen.findByRole('group', { name: '김민재 경기별 출전' });
    expect(await screen.findByText(status === 'pending' ? '팀 정보를 불러오고 있어요.' : '팀 정보를 불러오지 못했어요')).not.toBeVisible();
    expect(view.container.querySelector('.tm-topbar-heading')).toHaveTextContent(PAGE_TITLE);
    expect(view.container.querySelector('.tm-topbar-heading')).toBeVisible();
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: '뒤로가기' })).toHaveLength(1);
    expect(screen.getByRole('link', { name: '뒤로가기' })).toHaveAttribute('href', `/teams/${teamId}`);
    expect(screen.getByRole('group', { name: '김민재 경기별 출전' })).toBeVisible();

    if (status === '503') expect(screen.getByText('팀 정보 조회 실패')).not.toBeVisible();
    expect(screen.queryByRole('button', { name: '팀 정보 다시 불러오기' })).not.toBeInTheDocument();
    expect(teamInfoGets).toBe(1);
  });

  it.each([1188, 1440] as const)('%spx 팀 정보 응답 전에도 기본 제목·복귀·명단을 유지하고 로딩을 표시한다', async (width) => {
    teamInfoPending = true;
    renderAtWidth(width);
    await screen.findByRole('group', { name: '김민재 경기별 출전' });
    expect(screen.getByText('팀 정보를 불러오고 있어요.')).toBeVisible();
    expect(screen.getByRole('heading', { level: 1, name: PAGE_TITLE })).toBeVisible();
    expect(screen.getByRole('link', { name: '뒤로가기' })).toHaveAttribute('href', `/teams/${teamId}`);
    releaseTeamInfo?.();
    expect(await screen.findByRole('heading', { level: 1, name: `${TEAM_NAME} · ${PAGE_TITLE}` })).toBeVisible();
    expect(screen.queryByText('팀 정보를 불러오고 있어요.')).not.toBeInTheDocument();
  });

  it.each([1188, 1440] as const)('%spx 팀 정보 실패는 명시적으로 재시도하면서 기존 명단을 차단하지 않는다', async (width) => {
    teamInfoFails = true;
    renderAtWidth(width);
    await screen.findByRole('group', { name: '김민재 경기별 출전' });
    expect(await screen.findByText('팀 정보를 불러오지 못했어요')).toBeVisible();
    expect(screen.getByText('팀 정보 조회 실패')).toBeVisible();
    expect(screen.getByRole('heading', { level: 1, name: PAGE_TITLE })).toBeVisible();
    expect(screen.getByRole('link', { name: '뒤로가기' })).toHaveAttribute('href', `/teams/${teamId}`);
    teamInfoFails = false;
    fireEvent.click(screen.getByRole('button', { name: '팀 정보 다시 불러오기' }));
    expect(await screen.findByRole('heading', { level: 1, name: `${TEAM_NAME} · ${PAGE_TITLE}` })).toBeVisible();
    expect(screen.queryByText('팀 정보를 불러오지 못했어요')).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: '김민재 경기별 출전' })).toBeVisible();
    expect(teamInfoGets).toBe(2);
    expect(mock.requests.filter((request) => request.method === 'GET' && request.path === `/api/v1/teams/${teamId}/game-rosters`)).toHaveLength(1);
  });

  it.each([403, 503])('명단 조회 %s에서도 페이지·팀 맥락과 복귀를 잃지 않는다', async (status) => {
    if (status === 403) mock.setViewerRole('TEAM_MEMBER');
    else server.use(http.get('*/api/v1/teams/:requestedTeamId/game-rosters', () => HttpResponse.json({ status: 'error', statusCode: status, message: '명단 조회 실패' }, { status })));
    renderAtWidth(1440);
    expect(await screen.findByText(status === 403 ? '팀장·매니저만 볼 수 있어요' : '경기 명단을 불러오지 못했어요')).toBeVisible();
    expect(await screen.findByRole('heading', { level: 1, name: `${TEAM_NAME} · ${PAGE_TITLE}` })).toBeVisible();
    expect(screen.getByRole('link', { name: '뒤로가기' })).toHaveAttribute('href', `/teams/${teamId}`);
    expect(screen.queryByRole('button', { name: /저장/ })).not.toBeInTheDocument();
  });
});
