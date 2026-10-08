import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import RecordPage from '@/app/team-matches/[id]/record/page';
import { AppBackLink } from '@/components/v1-ui/app-back-link';
import type { SharedRecord } from '@/hooks/use-team-match-record';
import { TeamMatchSharedRecord } from './team-match-shared-record';
import styles from './team-match-shared-record.module.css';

// Only Next navigation and HTTP transport are replaced. The route, record view,
// API client, React Query hooks, goal renderer, and source-back link stay real.
const navigation = vi.hoisted(() => ({
  replace: vi.fn(), back: vi.fn(), push: vi.fn(), prefetch: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => navigation,
  useSearchParams: () => new URLSearchParams(window.location.search),
  usePathname: () => window.location.pathname,
}));

const matchId = 'ad400000-0000-4000-8000-000000000103';
const sourceHref = '/teams/ab300000-0000-4000-8000-000000000001/records?type=friendly&year=2026#records';
const fallbackHref = `/team-matches/${matchId}?view=detail`;
let record: SharedRecord;
let responseStatus: number;
let reads: number;
let writes: number;
const clients: QueryClient[] = [];
const server = setupServer(
  http.get(`*/api/v1/team-matches/${matchId}/record`, () => {
    reads += 1;
    return responseStatus === 200
      ? HttpResponse.json({ status: 'success', data: record, timestamp: '2026-10-08T13:00:00.000Z' })
      : HttpResponse.json({ status: 'error', statusCode: 404, code: 'TEAM_MATCH_NOT_FOUND', message: '경기를 찾을 수 없어요.' }, { status: responseStatus });
  }),
  http.post(`*/api/v1/team-matches/${matchId}/record`, () => {
    writes += 1;
    return HttpResponse.json({ status: 'error', statusCode: 409, code: 'TEAM_MATCH_RECORD_NOT_SHARED', message: '공동 기록 대상이 아니에요.' }, { status: 409 });
  }),
  http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  navigation.replace.mockReset();
  navigation.back.mockReset();
  reads = 0;
  writes = 0;
  responseStatus = 200;
  record = {
    leagueId: null, tournamentId: null, teamMatchId: matchId,
    title: '서울나이트FC vs 한강로버스', startsAt: '2026-09-26T10:00:00.000Z',
    phase: 'legacy', version: 0, serverTime: '2026-10-08T13:00:00.000Z',
    canEdit: false, participant: false, operator: false, teamAuthority: false, ownSideId: null,
    lineupReady: true, missingSides: [],
    sides: [{ id: 'home', key: 'HOME', name: '서울나이트FC', score: 1 }, { id: 'away', key: 'AWAY', name: '한강로버스', score: 3 }],
    subMatches: [], participants: [], goals: [], confirmations: [], history: [],
    officialAt: '2026-09-26T12:00:00.000Z', officialCorrected: false,
    goalEvents: [
      { sideId: 'home', participantName: '나이트7', minute: 8, ownGoal: false, subMatchId: null },
      { sideId: 'away', participantName: '로버스9', minute: 20, ownGoal: false, subMatchId: null },
      { sideId: 'away', participantName: null, minute: 35, ownGoal: true, subMatchId: null },
      { sideId: 'away', participantName: null, minute: 45, ownGoal: false, subMatchId: null },
    ],
  };
  window.history.replaceState({}, '', `/team-matches/${matchId}/record?from=${encodeURIComponent(sourceHref)}`);
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  server.resetHandlers();
});
afterAll(() => server.close());

async function renderRecord({ admin = false, shell = false }: { admin?: boolean; shell?: boolean } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  clients.push(client);
  const route = admin ? <TeamMatchSharedRecord teamMatchId={matchId} admin /> : await RecordPage({ params: Promise.resolve({ id: matchId }) });
  render(<QueryClientProvider client={client}>
    {shell ? <AppBackLink fallbackHref={fallbackHref}>뒤로</AppBackLink> : null}
    {route}
  </QueryClientProvider>);
  await waitFor(() => expect(client.isFetching()).toBe(0));
}

function expectReadOnly({ historyAllowed = false }: { historyAllowed?: boolean } = {}) {
  expect(screen.queryByRole('button', { name: /득점 추가|득점 등록|득점 삭제|종료 확인|서브매치 추가|수정 저장/ })).not.toBeInTheDocument();
  if (!historyAllowed) expect(screen.queryByText(/변경 이력/)).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /명단에서 나 찾기|늦게 온 선수 추가/ })).not.toBeInTheDocument();
  expect(screen.queryByText(/기록 편집은 양 팀의 참석명단/)).not.toBeInTheDocument();
  expect(writes).toBe(0);
}

describe('공개 친선 전적에서 기존 공식 기록 조회 (MD-QA #61)', () => {
  it('기존 경기의 읽기 전용 제목은 공동 쓰기를 약속하지 않는다', async () => {
    await renderRecord();
    expect(screen.getByRole('heading', { level: 1, name: '경기 기록' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: '함께 쓰는 경기 기록' })).not.toBeInTheDocument();
  });

  it('실제 공개 record route가 1:3과 네 공개 득점을 읽고 일반 상세로 돌리지 않는다', async () => {
    await renderRecord();
    expect(screen.getByRole('region', { name: '공동 점수판' })).toBeInTheDocument();
    expect(screen.getByLabelText('점수 1 대 3')).toHaveTextContent('1 : 3');
    const goals = within(screen.getByRole('list', { name: '득점 기록' }));
    expect(goals.getAllByRole('listitem')).toHaveLength(4);
    expect(goals.getByRole('listitem', { name: '홈 8분 나이트7 골' })).toBeInTheDocument();
    expect(goals.getByRole('listitem', { name: '원정 20분 로버스9 골' })).toBeInTheDocument();
    expect(goals.getByRole('listitem', { name: '원정 35분 OG 자책골' })).toBeInTheDocument();
    expect(goals.getByRole('listitem', { name: '원정 45분 익명 골' })).toBeInTheDocument();
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(reads).toBe(1);
    expectReadOnly();
  });

  it('공개 legacy 득점은 빈 aside 없이 기존 한 열 stack을 사용한다', async () => {
    await renderRecord();
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    const goalsSection = screen.getByRole('heading', { level: 2, name: '득점 기록' }).closest('section');
    const content = goalsSection?.parentElement?.parentElement;
    expect(content).toHaveClass(styles.stack);
    expect(content).not.toHaveClass(styles.columns);
    expect(screen.getByRole('list', { name: '득점 기록' })).toBeInTheDocument();
  });

  it('공개 STATUS_ONLY legacy는 숨긴 득점의 빈 제목과 빈 콘텐츠 영역을 남기지 않는다', async () => {
    record = { ...record, sides: record.sides.map((side) => ({ ...side, score: null })), goalEvents: [], officialAt: null };
    await renderRecord();
    expect(screen.getByLabelText('점수 ? 대 ?')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: '득점 기록' })).not.toBeInTheDocument();
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(screen.getByRole('main').querySelector(`.${styles.columns}, .${styles.stack}`)).toBeNull();
    expectReadOnly();
  });

  it('받은 공개 정책이 점수와 이벤트를 숨기면 0:0이나 득점을 만들지 않는다', async () => {
    record = { ...record, sides: record.sides.map((side) => ({ ...side, score: null })), goalEvents: [], officialAt: null };
    await renderRecord();
    expect(screen.getByLabelText('점수 ? 대 ?')).toHaveTextContent('? : ?');
    expect(screen.queryByRole('list', { name: '득점 기록' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('점수 0 대 0')).not.toBeInTheDocument();
    expect(screen.queryByText('아직 등록된 득점이 없어요.')).not.toBeInTheDocument();
    expect(screen.queryByText('참가자들의 공동 기록으로 점수가 갱신돼요.')).not.toBeInTheDocument();
    expect(navigation.replace).not.toHaveBeenCalled();
    expectReadOnly();
  });

  it('같은 공개 공식 결과를 admin shell에서도 쓰기 없이 조회한다', async () => {
    await renderRecord({ admin: true });
    expect(screen.getByLabelText('점수 1 대 3')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: '득점 기록' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '팀매치 운영 상세로' })).toHaveAttribute('href', `/admin/team-matches/${matchId}`);
    expect(navigation.replace).not.toHaveBeenCalled();
    expectReadOnly();
  });

  it.each([false, true])('인증된 기존 경기의 operator=%s도 결과·허용 이력만 읽고 공동 쓰기를 안내하지 않는다', async (operator) => {
    record = {
      ...record, participant: !operator, operator, teamAuthority: !operator, ownSideId: operator ? null : 'home',
      history: operator ? [] : [{ id: 'history-1', version: 1, action: 'add', actorName: '합성 운영자', goalId: null, subMatchId: null, before: null, after: null, at: record.serverTime }],
    };
    await renderRecord({ admin: operator });
    expect(screen.getByLabelText('점수 1 대 3')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: '득점 기록' })).toBeInTheDocument();
    if (operator) {
      expect(screen.queryByText(/변경 이력/)).not.toBeInTheDocument();
      expect(screen.queryByText('첫 기록을 기다리고 있어요.')).not.toBeInTheDocument();
    } else {
      const history = screen.getByText('변경 이력 · 1건');
      expect(screen.getByRole('complementary')).toContainElement(history);
      expect(history.closest('aside')?.parentElement).toHaveClass(styles.columns);
    }
    expect(screen.queryByText(/각 팀에서 한 명씩 현재 기록을 확인/)).not.toBeInTheDocument();
    expect(screen.queryByText(/명단에 없어도 기록하고 종료를 확인/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Teameet 운영으로 양 팀과 함께 기록/)).not.toBeInTheDocument();
    expect(navigation.replace).not.toHaveBeenCalled();
    expectReadOnly({ historyAllowed: !operator });
  });

  it.each([false, true])('공식 0:0과 빈 공개 이벤트를 조회할 때 admin=%s에서도 공동 기록 갱신을 안내하지 않는다', async (admin) => {
    record = { ...record, sides: record.sides.map((side) => ({ ...side, score: 0 })), goalEvents: [] };
    await renderRecord({ admin });
    expect(screen.getByLabelText('점수 0 대 0')).toHaveTextContent('0 : 0');
    expect(screen.getByText('아직 등록된 득점이 없어요.')).toBeInTheDocument();
    expect(screen.queryByText('참가자들의 공동 기록으로 점수가 갱신돼요.')).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: '득점 기록' })).not.toBeInTheDocument();
    expectReadOnly();
  });

  it.each([true, false])('managed %s 리그/대회 handoff는 출처 query와 hash를 보존한다', async (league) => {
    record = { ...record, phase: 'managed', leagueId: league ? 'league-1' : null, tournamentId: 'tournament-1' };
    await renderRecord();
    const detail = league ? `/league-matches/league-1/fixtures/${matchId}` : `/tournaments/tournament-1/matches/${matchId}`;
    expect(navigation.replace).toHaveBeenCalledWith(`${detail}?from=${encodeURIComponent(sourceHref)}`);
    expect(screen.queryByRole('region', { name: '공동 점수판' })).not.toBeInTheDocument();
    expect(writes).toBe(0);
  });

  it('공개 기록에서 실제 AppBackLink가 친선/연도 필터와 hash가 있는 원래 전적으로 돌아간다', async () => {
    await renderRecord({ shell: true });
    expect(screen.getByLabelText('점수 1 대 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: '뒤로가기' }));
    expect(navigation.replace).toHaveBeenCalledWith(sourceHref);
    expect(navigation.back).not.toHaveBeenCalled();
    expectReadOnly();
  });

  it.each(['', '?from=https%3A%2F%2Fexample.org%2Fsecret'])('direct 또는 외부 from 경로(%s)는 현재 상세 fallback을 유지한다', async (query) => {
    window.history.replaceState({}, '', `/team-matches/${matchId}/record${query}`);
    await renderRecord({ shell: true });
    expect(screen.getByLabelText('점수 1 대 3')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '뒤로가기' })).toHaveAttribute('href', fallbackHref);
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it('숨긴 경기/실제 404는 오류와 재시도를 보여 주고 점수나 redirect 성공으로 바꾸지 않는다', async () => {
    responseStatus = 404;
    await renderRecord();
    expect(screen.getByRole('alert')).toHaveTextContent('경기를 찾을 수 없어요.');
    expect(screen.getByRole('button', { name: '다시 불러오기' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '공동 점수판' })).not.toBeInTheDocument();
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(writes).toBe(0);
    responseStatus = 200;
    fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
    expect(await screen.findByLabelText('점수 1 대 3')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(reads).toBe(2);
    expectReadOnly();
  });
});
