import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { TournamentRosterPageClient } from './tournament-roster-client';
import type { V1AddPlayerPayload } from '@/types/api';

const state = vi.hoisted(() => ({ kind: 'regular_tournament' }));
const members = [
  { userId: 'male', displayName: '남자선수', realName: '남자선수', gender: 'male', role: 'member', birthDate: '1995-03-15', phone: '01012345678' },
  { userId: 'female', displayName: '여자선수', realName: '여자선수', gender: 'female', role: 'member', birthDate: '1995-03-15', phone: '01012345678' },
  { userId: 'unknown', displayName: '미입력선수', realName: '미입력선수', gender: null, role: 'member', birthDate: '1995-03-15', phone: '01012345678' },
];
let submitted: V1AddPlayerPayload | undefined;
let memberCount = 3;
const server = setupServer(
  http.get('*/api/v1/teams/team/members', () => HttpResponse.json({ status: 'success', data: {
    items: [...members, ...Array.from({ length: memberCount - 3 }, (_, i) => ({ ...members[0], userId: `extra-${i}` }))],
    pageInfo: { hasNext: false, nextCursor: null },
  } })),
  http.post('*/api/v1/tournaments/competition/registrations/registration/players', async ({ request }) => {
    submitted = await request.json() as V1AddPlayerPayload;
    return HttpResponse.json({ status: 'success', data: { ...submitted, id: 'saved-player' } }, { status: 201 });
  }),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => { cleanup(); submitted = undefined; memberCount = 3; state.kind = 'regular_tournament'; });
afterAll(() => server.close());
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock('@/hooks/use-v1-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-v1-api')>()),
  useV1Tournament: () => ({ data: { id: 'competition', title: '테스트 대회', kind: state.kind, status: 'open', minPlayers: 1, maxPlayers: 10, genderCategory: null } }),
  useV1Registration: () => ({ data: { id: 'registration', teamId: 'team', status: 'confirmed', rosterLockedAt: null } }),
  useV1TeamDetail: () => ({ data: { name: '테스트 팀', viewer: { role: 'owner' } }, isPending: false, isError: false, isPlaceholderData: false }),
  useV1TournamentPlayers: () => ({ data: { players: [], belowMinimum: true }, isLoading: false, isError: false }),
}));
function show() {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
    <TournamentRosterPageClient tournamentId="competition" registrationId="registration" />
  </QueryClientProvider>);
  fireEvent.click(screen.getByRole('button', { name: '선수 추가' }));
}
describe('선수 추가 성별·골레이 — 실제 폼과 POST payload', () => {
  it('선택한 선수의 성별을 읽기 전용으로 바꾸고 미입력을 구분한다', async () => {
    show();
    const select = await screen.findByLabelText(/팀원 선택/);
    await screen.findByRole('option', { name: /남자선수/ });
    expect(screen.queryByLabelText('팀원 이름 검색')).not.toBeInTheDocument();
    fireEvent.change(select, { target: { value: 'male' } });
    expect(screen.getByLabelText('성별')).toHaveValue('남성');
    expect(screen.getByLabelText('성별')).toHaveAttribute('readonly');
    fireEvent.change(select, { target: { value: 'female' } });
    expect(screen.getByLabelText('성별')).toHaveValue('여성');
    fireEvent.change(select, { target: { value: 'unknown' } });
    expect(screen.getByLabelText('성별')).toHaveValue('미입력');
  });
  it.each([['regular_tournament', false], ['regular_tournament', true], ['regular_league', false], ['regular_league', true]] as const)('%s의 골레이 %s 선택값을 실제 추가 API에 보낸다', async (kind, goalkeeper) => {
    state.kind = kind;
    show();
    await screen.findByRole('option', { name: /남자선수/ });
    fireEvent.change(screen.getByLabelText(/팀원 선택/), { target: { value: 'male' } });
    const checkbox = screen.getByRole('checkbox', { name: '골레이로 등록해요' });
    expect(checkbox).not.toBeChecked();
    if (goalkeeper) fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole('button', { name: '선수 등록' }));
    await waitFor(() => expect(submitted).toMatchObject({ userId: 'male', goalkeeper }));
    expect(submitted).not.toHaveProperty('gender');
  });
  it('기존처럼 팀원 8명부터 이름 검색을 표시한다', async () => {
    memberCount = 8;
    show();
    expect(await screen.findByLabelText('팀원 이름 검색')).toBeInTheDocument();
  });
});
