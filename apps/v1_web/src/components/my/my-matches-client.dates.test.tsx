import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { V1Match, V1MyTeamMatch } from '@/types/api';
import { toMatchCard } from '../matches/matches.card-model';
import { getMatchDetailViewModel } from '../matches/matches.view-model';
import { toTeamMatch } from '../team-matches/team-matches.card-model';
import { getTeamMatchDetailViewModel } from '../team-matches/team-matches.view-model';
import { MyMatchesPageClient } from './my-matches-client';

const navigation = vi.hoisted(() => ({ search: '' }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/my/matches/joined',
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

const schedules = [
  { key: 'utc', startsAt: '2026-10-08T11:48:00.000Z', date: '10월 8일 (목)', time: '20:48' },
  { key: 'boundary', startsAt: '2026-10-11T16:48:00.000Z', date: '10월 12일 (월)', time: '01:48' },
  { key: 'kst-offset', startsAt: '2026-10-12T01:48:00+09:00', date: '10월 12일 (월)', time: '01:48' },
  { key: 'la-offset', startsAt: '2026-10-11T09:48:00-07:00', date: '10월 12일 (월)', time: '01:48' },
  { key: 'invalid', startsAt: 'not-a-date', date: 'not-a-date', time: '' },
  { key: 'empty', startsAt: '', date: '', time: '' },
] as const;

let mode: 'joined' | 'created' = 'joined';
let personalItems: V1Match[] = [];
let teamItems: V1MyTeamMatch[] = [];
let personalRequests = 0;
let teamRequests = 0;
const clients: QueryClient[] = [];
const pageInfo = { nextCursor: null, hasNext: false };
const server = setupServer(
  http.get('*/api/v1/me/matches', ({ request }) => {
    personalRequests += 1;
    const params = new URL(request.url).searchParams;
    if (params.get('mode') !== mode || params.get('limit') !== '50') {
      return new HttpResponse(null, { status: 400 });
    }
    return HttpResponse.json({ status: 'success', data: { items: personalItems, pageInfo } });
  }),
  http.get('*/api/v1/me/team-matches', ({ request }) => {
    teamRequests += 1;
    const params = new URL(request.url).searchParams;
    if (params.get('scope') !== (mode === 'joined' ? 'applied' : 'created') || params.get('limit') !== '50') {
      return new HttpResponse(null, { status: 400 });
    }
    return HttpResponse.json({ status: 'success', data: { items: teamItems, pageInfo } });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  navigation.search = '';
  personalItems = [];
  teamItems = [];
  personalRequests = 0;
  teamRequests = 0;
});
afterEach(() => {
  cleanup();
  for (const client of clients) client.clear();
  clients.length = 0;
  server.resetHandlers();
  vi.unstubAllEnvs();
});

describe('내 매치 일시 — 실제 조회 훅·카드·상세 KST 계약 (MD-QA #49)', () => {
  it.each(['joined', 'created'] as const)('%s 개인·팀 목록은 같은 API 시각을 상세와 같은 KST로 표시한다', async (listMode) => {
    mode = listMode;
    personalItems = schedules.map(({ key, startsAt }) => ({
      id: `personal-${key}`, title: `개인 ${key}`, startsAt,
      sportName: '풋살', placeName: '테스트 구장', capacityText: '0/10',
      status: 'recruiting', viewerState: mode === 'created' ? 'host' : 'participant',
    }));
    teamItems = schedules.map(({ key, startsAt }) => ({
      teamMatchId: `team-${key}`, title: `팀 ${key}`, startsAt, sportName: '풋살',
      status: 'matched', relation: mode === 'created' ? 'created_by_me' : 'approved',
      teamId: 'team-a', teamName: '테스트 팀', detailRoute: `/team-matches/team-${key}`,
      manageRoute: mode === 'created' ? `/team-matches/team-${key}` : null,
    }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    clients.push(client);

    render(<QueryClientProvider client={client}><MyMatchesPageClient mode={mode} /></QueryClientProvider>);
    await waitFor(() => expect(screen.getAllByRole('link', { name: '상세' })).toHaveLength(schedules.length * 2));

    for (const schedule of schedules) {
      const personal = personalItems.find((item) => item.id === `personal-${schedule.key}`);
      const team = teamItems.find((item) => item.teamMatchId === `team-${schedule.key}`);
      expect(personal).toBeDefined();
      expect(team).toBeDefined();
      if (!personal || !team) continue;

      const personalDetail = toMatchCard(personal, getMatchDetailViewModel().match);
      const teamDetail = toTeamMatch({
        id: team.teamMatchId, teamMatchId: team.teamMatchId, title: team.title, startsAt: team.startsAt,
        sportName: team.sportName, placeName: '테스트 구장', capacityText: '0/2',
        status: 'recruiting', displayState: 'matched',
      }, getTeamMatchDetailViewModel().match);
      // 고정된 기대값으로 목록과 상세가 함께 잘못된 시간대를 쓰는 회귀도 잡는다.
      expect([personalDetail.date, personalDetail.time]).toEqual([schedule.date, schedule.time]);
      expect([teamDetail.date, teamDetail.time]).toEqual([schedule.date, schedule.time]);
      const expectedDateTime = [schedule.date, schedule.time].filter(Boolean).join(' ');
      expect.soft(screen.getByText(personal.title).closest('.tm-my-card-head')?.querySelector('.tm-my-card-meta')?.textContent)
        .toBe(`${expectedDateTime} · ${personal.placeName}`);
      expect.soft(screen.getByText(team.title).closest('.tm-my-card-head')?.querySelector('.tm-my-card-meta')?.textContent)
        .toBe(`${expectedDateTime} · ${team.sportName}`);
    }
    expect({ personalRequests, teamRequests }).toEqual({ personalRequests: 1, teamRequests: 1 });
    const from = encodeURIComponent(`/my/matches/${mode}`);
    expect(screen.getAllByRole('link', { name: '상세' }).map((link) => link.getAttribute('href'))).toContain(`/team-matches/team-utc?from=${from}`);
  });

  it('실제 UTC·KST·LA 호스트에서도 상세 공용 함수의 날짜·시각은 같다', () => {
    // worker의 TZ 값만 바꾸면 V8 시간대가 그대로일 수 있어 새 Node 프로세스로 확인한다.
    const { outputText } = transpileModule(readFileSync(resolve('src/lib/date-utils.ts'), 'utf8'), {
      compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022, removeComments: true },
    });
    const moduleUrl = `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
    for (const host of [
      { timeZone: 'UTC', offset: 0 },
      { timeZone: 'Asia/Seoul', offset: -540 },
      { timeZone: 'America/Los_Angeles', offset: 420 },
    ] as const) {
      const script = `
        import { formatCardDate, formatCardTime } from ${JSON.stringify(moduleUrl)};
        const schedules = ${JSON.stringify(schedules)};
        console.log(JSON.stringify({
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          offset: new Date(schedules[0].startsAt).getTimezoneOffset(),
          labels: schedules.map(({ startsAt }) => [formatCardDate(startsAt), formatCardTime(startsAt)]),
        }));
      `;
      const output = execFileSync(process.execPath, ['--input-type=module', '--eval', script], {
        env: { ...process.env, TZ: host.timeZone }, encoding: 'utf8', timeout: 10_000,
      });
      expect(JSON.parse(output)).toEqual({
        timeZone: host.timeZone, offset: host.offset,
        labels: schedules.map(({ date, time }) => [date, time]),
      });
    }
  });
});
