/**
 * 대회·리그 상세 "우리 팀 참가" 카드(Task 180 R-1 A). 실제 훅이 MSW 서버에 보내는 요청과 그 결과 화면을 본다 —
 * 누가 [명단 수정]·[명단 보기]를 보는지, 막힌 이유가 명단 화면과 같은지, 링크가 명단 화면으로 바로 가는지.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStoredV1Session, saveStoredV1Session } from '@/lib/session-storage';
import type { V1TournamentRegistration } from '@/types/api';
import { CompetitionEntrySection } from './competition-entry-card';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/league-matches/comp-1',
}));

const NOW = '2026-10-01T00:00:00.000Z';
const FROM = `?from=${encodeURIComponent('/league-matches/comp-1')}`;
const PAST = '2026-09-26T14:59:00.000Z';
const FUTURE = '2099-10-08T14:59:00.000Z';

type Competition = { id: string; status: string; kind: string | null; rosterDeadlineAt: string | null; scheduledEndAt: string | null };

let competition: Competition;
let registrations: Partial<V1TournamentRegistration>[];
let myTeams: { teamId: string; role: string; name: string }[];
let upcoming: { gameId: string; tournamentId: string | null; scheduledAt: string | null }[];
let requests: string[];
let server: ReturnType<typeof setupServer>;

function registration(extra: Partial<V1TournamentRegistration> = {}): Partial<V1TournamentRegistration> {
  return {
    id: 'reg-1',
    tournamentId: 'comp-1',
    teamId: 'team-a',
    teamName: '마포 FC',
    status: 'confirmed',
    rosterLockedAt: null,
    rosterDeadlineOverrideAt: null,
    playerCount: 10,
    ...extra,
  };
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  saveStoredV1Session({ userId: 'captain' });
  competition = { id: 'comp-1', status: 'in_progress', kind: 'regular_league', rosterDeadlineAt: null, scheduledEndAt: null };
  registrations = [registration()];
  myTeams = [{ teamId: 'team-a', role: 'owner', name: '마포 FC' }];
  upcoming = [];
  requests = [];
  const ok = (data: unknown) => HttpResponse.json({ status: 'success', data, timestamp: NOW });
  const track = (request: Request) => requests.push(new URL(request.url).pathname);
  server = setupServer(
    http.get('*/api/v1/tournaments/:id/registrations/my-registrations', ({ request }) => (track(request), ok(registrations))),
    http.get('*/api/v1/tournaments/:id', ({ request }) => (track(request), ok({ ...competition, fixtures: [] }))),
    http.get('*/api/v1/me/teams', ({ request }) => (track(request), ok({ items: myTeams.map((t) => ({ ...t, logoUrl: null })) }))),
    http.get('*/api/v1/teams/:teamId/upcoming-games', ({ request }) => (track(request), ok({ items: upcoming }))),
    http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })),
  );
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.close();
  clearStoredV1Session();
  vi.unstubAllEnvs();
});

function renderSection({ withCompetition = true }: { withCompetition?: boolean } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CompetitionEntrySection
        competitionId="comp-1"
        competition={withCompetition ? (competition as never) : undefined}
      />
    </QueryClientProvider>,
  );
}

const card = async (team: string) =>
  (await screen.findByText(team)).closest('section') as HTMLElement;
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

describe('CompetitionEntrySection — 팀장', () => {
  it('참가 확정 팀장에게 상태·선수 수와 명단 화면으로 바로 가는 [명단 수정]을 준다', async () => {
    renderSection();
    const entry = await card('마포 FC');
    expect(within(entry).getByRole('heading', { name: '우리 팀 참가' })).toBeInTheDocument();
    expect(within(entry).getByText('참가 확정')).toBeInTheDocument();
    expect(within(entry).getByText('선수 10명')).toBeInTheDocument();
    expect(within(entry).getByRole('link', { name: '마포 FC 참가 명단 수정하기' })).toHaveAttribute(
      'href',
      `/tournaments/comp-1/registrations/reg-1/roster${FROM}`,
    );
    expect(within(entry).getByRole('link', { name: '신청 내역' })).toHaveAttribute(
      'href',
      `/tournaments/comp-1/my?reg=reg-1&from=${encodeURIComponent('/league-matches/comp-1')}`,
    );
    expect(within(entry).getByText(/운영진이 명단을 잠그기 전까지/)).toBeInTheDocument();
    // 고칠 수 있으면 경기 명단 길은 필요 없다 — 다가오는 경기를 부르지 않는다.
    expect(requests.some((path) => path.endsWith('/upcoming-games'))).toBe(false);
  });

  it('초안 리그는 고칠 수 있고, 같은 초안이라도 일반 대회는 아직 못 고친다(명단 화면과 같은 판정)', async () => {
    competition = { ...competition, status: 'draft', kind: 'regular_league' };
    const { unmount } = renderSection();
    expect(await screen.findByRole('link', { name: '마포 FC 참가 명단 수정하기' })).toBeInTheDocument();
    unmount();

    competition = { ...competition, status: 'draft', kind: 'regular_tournament' };
    renderSection();
    const entry = await card('마포 FC');
    expect(within(entry).getByRole('link', { name: '마포 FC 참가 명단 보기' })).toBeInTheDocument();
    expect(within(entry).getByText('수정 불가')).toBeInTheDocument();
    expect(within(entry).getByText(/대회가 아직 공개되지 않아/)).toBeInTheDocument();
  });

  it('명단 제출 마감이 지나면 [명단 보기]와 이 대회의 다음 경기 명단으로 가는 길을 준다', async () => {
    competition = { ...competition, rosterDeadlineAt: PAST };
    upcoming = [
      { gameId: 'other-comp-game', tournamentId: 'comp-2', scheduledAt: '2026-10-02T01:00:00.000Z' },
      { gameId: 'later-game', tournamentId: 'comp-1', scheduledAt: '2026-10-11T01:00:00.000Z' },
      { gameId: 'next-game', tournamentId: 'comp-1', scheduledAt: '2026-10-04T01:00:00.000Z' },
    ];
    renderSection();
    const entry = await card('마포 FC');
    expect(within(entry).getByText('제출 마감')).toBeInTheDocument();
    expect(within(entry).getByRole('link', { name: '마포 FC 참가 명단 보기' })).toBeInTheDocument();
    expect(within(entry).getByText(/명단 제출 마감\(9월 26일 \(토\) 오후 11:59\)이 지났어요\./)).toBeInTheDocument();
    expect(within(entry).getByText(/경기 명단에서 뺄 수 있어요/)).toBeInTheDocument();
    const next = await within(entry).findByRole('link', { name: /^다음 경기 명단 열기/ });
    expect(next).toHaveAttribute('href', `/teams/team-a/games/next-game/roster${FROM}`);
    expect(within(entry).queryByRole('link', { name: '신청 내역' })).not.toBeInTheDocument();
  });

  it('마감이 지났어도 운영진 예외가 있으면 고칠 수 있다', async () => {
    competition = { ...competition, rosterDeadlineAt: PAST };
    registrations = [registration({ rosterDeadlineOverrideAt: '2026-09-27T00:00:00.000Z' })];
    renderSection();
    const entry = await card('마포 FC');
    expect(within(entry).getByRole('link', { name: '마포 FC 참가 명단 수정하기' })).toBeInTheDocument();
    expect(within(entry).getByText(/운영진이 수정을 열어 뒀어요/)).toBeInTheDocument();
    expect(within(entry).queryByText('제출 마감')).not.toBeInTheDocument();
  });

  it('마감 전이면 언제까지 고칠 수 있는지 말한다', async () => {
    competition = { ...competition, rosterDeadlineAt: FUTURE };
    renderSection();
    expect(await screen.findByText(/명단 제출 마감\(10월 8일 .+\)까지 선수 추가·빼기와 등번호를 바꿀 수 있어요\./)).toBeInTheDocument();
  });

  it('종료된 리그는 [명단 보기]만 — 다음 경기를 찾지 않는다', async () => {
    competition = { ...competition, status: 'completed' };
    renderSection();
    const entry = await card('마포 FC');
    expect(within(entry).getByText('수정 불가')).toBeInTheDocument();
    expect(within(entry).getByRole('link', { name: '마포 FC 참가 명단 보기' })).toBeInTheDocument();
    expect(within(entry).getByRole('link', { name: '신청 내역' })).toBeInTheDocument();
    await settle();
    expect(requests.some((path) => path.endsWith('/upcoming-games'))).toBe(false);
  });
});

describe('CompetitionEntrySection — 팀원·여러 팀', () => {
  it('팀원에게도 같은 카드로 [명단 보기]를 준다 — 고칠 수 있는 명단이어도 수정 버튼은 없다', async () => {
    myTeams = [{ teamId: 'team-a', role: 'member', name: '마포 FC' }];
    renderSection();
    const entry = await card('마포 FC');
    expect(within(entry).getByRole('link', { name: '마포 FC 참가 명단 보기' })).toHaveAttribute(
      'href',
      `/tournaments/comp-1/registrations/reg-1/roster${FROM}`,
    );
    expect(within(entry).queryByRole('link', { name: /명단 수정/ })).not.toBeInTheDocument();
    expect(within(entry).getByText(/팀장·매니저가 바꿔요/)).toBeInTheDocument();
  });

  it('두 팀으로 신청했으면 팀마다 카드가 있고, 역할도 팀마다 따로 본다', async () => {
    registrations = [
      registration(),
      registration({ id: 'reg-2', teamId: 'team-b', teamName: '합정 유나이티드', status: 'awaiting_payment', playerCount: 6 }),
    ];
    myTeams = [
      { teamId: 'team-a', role: 'owner', name: '마포 FC' },
      { teamId: 'team-b', role: 'member', name: '합정 유나이티드' },
    ];
    renderSection();
    const a = await card('마포 FC');
    const b = await card('합정 유나이티드');
    expect(within(a).getByRole('link', { name: '마포 FC 참가 명단 수정하기' })).toBeInTheDocument();
    expect(within(b).getByRole('link', { name: '합정 유나이티드 참가 명단 보기' })).toHaveAttribute(
      'href',
      `/tournaments/comp-1/registrations/reg-2/roster${FROM}`,
    );
    expect(within(b).getByText('입금 대기')).toBeInTheDocument();
    expect(within(b).getByText('선수 6명')).toBeInTheDocument();
  });
});

describe('CompetitionEntrySection — 보이는 조건', () => {
  it('비로그인이면 아무것도 조회하지 않는다(공개 화면에서 401 을 만들지 않는다)', async () => {
    clearStoredV1Session();
    const { container } = renderSection();
    await settle();
    expect(requests).toEqual([]);
    expect(container).toBeEmptyDOMElement();
  });

  it('취소된 신청만 있으면 카드가 없다', async () => {
    registrations = [registration({ status: 'cancelled' })];
    renderSection();
    await waitFor(() => expect(requests).toContain('/api/v1/tournaments/comp-1/registrations/my-registrations'));
    await settle();
    expect(screen.queryByRole('heading', { name: '우리 팀 참가' })).not.toBeInTheDocument();
  });

  it('리그 상세처럼 대회 정보가 없으면 신청이 있을 때만 대회 상세를 받아 같은 판정을 쓴다', async () => {
    competition = { ...competition, rosterDeadlineAt: PAST };
    renderSection({ withCompetition: false });
    const entry = await card('마포 FC');
    expect(requests).toContain('/api/v1/tournaments/comp-1');
    expect(within(entry).getByText('제출 마감')).toBeInTheDocument();
  });

  it('신청이 없으면 대회 상세를 따로 받지 않는다', async () => {
    registrations = [];
    renderSection({ withCompetition: false });
    await waitFor(() => expect(requests).toContain('/api/v1/tournaments/comp-1/registrations/my-registrations'));
    await settle();
    expect(requests).not.toContain('/api/v1/tournaments/comp-1');
  });
});
