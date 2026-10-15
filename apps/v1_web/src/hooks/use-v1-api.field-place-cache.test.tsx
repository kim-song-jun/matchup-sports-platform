import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { useV1AssignFixtureField } from './use-v1-api';
import { publicGameRecordsKeys, usePublicTournamentSchedule } from '@/components/public-game-records/use-public-game-records';
import type { PublicTournamentScheduleResponse } from '@/components/public-game-records/types';

let venue = '이전 구장';
const schedule = (): PublicTournamentScheduleResponse => ({ tournamentId: 'synthetic-competition', tournamentTitle: '합성 대회',
  bracketPublished: true, nextCursor: null, standings: [], unscheduled: [], items: [{ fixtureId: 'synthetic-fixture',
    fixtureNumber: 1, round: 'final', legNumber: 1, groupId: null, groupName: null, scheduledAt: '2020-01-01T09:00:00Z',
    venue, fieldId: venue === '선택 구장' ? 'synthetic-field' : null, fieldName: null, home: null, away: null,
    homeSlotLabel: null, awaySlotLabel: null, status: 'ended', visibilityMode: 'live', resultState: 'pending',
    scoreStatus: 'unavailable', score: null, clock: null, periodBreak: null, scorers: [], cards: [], hasVideo: false, outcome: null,
  }] });
const success = (data: unknown) => HttpResponse.json({ status: 'success', data, timestamp: '2026-10-14T00:00:00Z' });
const server = setupServer(
  http.patch('*/api/v1/tournament-ops/tournaments/synthetic-competition/fixtures/synthetic-fixture/field', async ({ request }) => {
    const body = await request.json() as { fieldId: string };
    if (body.fieldId !== 'synthetic-field') return HttpResponse.json({ message: '잘못된 필드' }, { status: 400 });
    venue = '선택 구장';
    return success({ fixtureId: 'synthetic-fixture', tournamentId: 'synthetic-competition', fieldId: body.fieldId });
  }),
  http.get('*/api/v1/tournaments/synthetic-competition/schedule', () => success(schedule())),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => { cleanup(); venue = '이전 구장'; server.resetHandlers(); });
afterAll(() => server.close());

function Viewer() {
  const publicSchedule = usePublicTournamentSchedule('synthetic-competition');
  const assign = useV1AssignFixtureField('synthetic-competition');
  return <>
    <p>{publicSchedule.data?.pages[0].items[0].venue}</p>
    <button onClick={() => assign.mutate({ fixtureId: 'synthetic-fixture', fieldId: 'synthetic-field' })}>경기장 선택 저장</button>
    {assign.isError ? <p role="alert">저장 실패</p> : null}
  </>;
}

describe('필드 저장 뒤 공개 일정의 실제 쿼리 캐시', () => {
  it('폴링하지 않는 종료 경기와 Infinity 캐시도 저장 성공 뒤 새 장소로 갱신된다', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const key = publicGameRecordsKeys.schedule('synthetic-competition', {});
    client.setQueryDefaults(key, { staleTime: Infinity });
    client.setQueryData(key, { pages: [schedule()], pageParams: [null] });
    render(<QueryClientProvider client={client}><Viewer /></QueryClientProvider>);
    expect(screen.getByText('이전 구장')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '경기장 선택 저장' }));
    await waitFor(() => expect(screen.getByText('선택 구장')).toBeInTheDocument());
    expect(screen.queryByText('이전 구장')).not.toBeInTheDocument();
    client.clear();
  });
});
