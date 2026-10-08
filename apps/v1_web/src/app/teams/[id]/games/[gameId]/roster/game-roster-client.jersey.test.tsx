/**
 * 경기 명단에서 바로 등번호 입력(Task 180 G8) — 번호 칸이 팀장·매니저에게만 버튼이 되고, 저장은 참가 명단 등번호 API 로
 * 간다. 실제 훅이 MSW 상태형 서버(번호 원본·중복 규칙 포함)에 보내는 요청과 그 뒤 화면을 본다.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createV1GameRosterMswHandlers, GAME_ROSTER_MSW } from '@/test/msw/game-roster-handlers';
import { GameRosterClient } from './game-roster-client';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/teams/team-1/games/roster-game-1/roster',
}));

const { teamId, tournamentId, registrationId } = GAME_ROSTER_MSW;
const [G1] = GAME_ROSTER_MSW.games;
const [kim, park, han] = GAME_ROSTER_MSW.players;
const jerseyPath = (participantId: string) =>
  `/api/v1/tournaments/${tournamentId}/registrations/${registrationId}/players/${participantId}/jersey-number`;

let mock: ReturnType<typeof createV1GameRosterMswHandlers>;
let server: ReturnType<typeof setupServer>;

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  mock = createV1GameRosterMswHandlers();
  server = setupServer(...mock.handlers, http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })));
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.close();
  vi.unstubAllEnvs();
});

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <GameRosterClient teamId={teamId} gameId={G1.gameId} />
    </QueryClientProvider>,
  );
}

const patches = () => mock.requests.filter((r) => r.method === 'PATCH');
const jerseyButtons = () => screen.queryAllByRole('button', { name: /등번호/ });

async function openSheet(name: string) {
  fireEvent.click(await screen.findByRole('button', { name }));
  return screen.findByRole('dialog');
}

describe('팀장·매니저 — 번호 칸이 곧 입력 버튼', () => {
  it('번호가 있는 칸은 "바꾸기", 빈 칸은 "넣기" 버튼이고 출전 체크와 따로 저장된다', async () => {
    renderScreen();
    expect(await screen.findByRole('button', { name: '김민재 등번호 7번 바꾸기' })).toHaveTextContent('7');
    expect(screen.getByRole('button', { name: '박서준 등번호 10번 바꾸기' })).toHaveTextContent('10');
    expect(screen.getByRole('button', { name: '한도윤 등번호 넣기' })).toBeInTheDocument();
    expect(screen.getByText(/번호 칸을 눌러 등번호를 넣어요\. 대회 참가 명단에 저장돼요\./)).toBeInTheDocument();
    // 번호 저장은 시트에서 즉시 나가고, 하단 저장(출전 체크)은 그대로 비활성이다.
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();
  });

  it('빈 칸에 번호를 넣으면 참가 명단 등번호 API 로 저장되고 시트가 닫히며 화면에 번호가 나온다', async () => {
    renderScreen();
    const dialog = await openSheet('한도윤 등번호 넣기');
    expect(within(dialog).getByRole('heading', { name: '한도윤 등번호' })).toBeInTheDocument();
    expect(within(dialog).getByText('이 대회 참가 명단에 저장돼요. 대회 모든 경기 명단·기록에 같은 번호가 나가요.')).toBeInTheDocument();
    const input = within(dialog).getByLabelText('등번호');
    expect(input).toHaveFocus();
    expect(within(dialog).getByRole('button', { name: '번호를 입력해 주세요' })).toBeDisabled();

    fireEvent.change(input, { target: { value: '9' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '9번으로 저장' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(patches().map((r) => [r.path, r.body])).toEqual([[jerseyPath(han.participantId), { jerseyNumber: 9 }]]);
    expect(await screen.findByRole('button', { name: '한도윤 등번호 9번 바꾸기' })).toBeInTheDocument();
    // 저장하면 명단이 번호순으로 다시 정렬된다(서버 순서 그대로).
    const names = screen.getAllByRole('checkbox').map((box) => box.getAttribute('aria-label'));
    expect(names).toEqual(['김민재 이번 경기 출전', '한도윤 이번 경기 출전', '박서준 이번 경기 출전']);
  });

  it('번호를 비우고 저장하면 null 로 지운다', async () => {
    renderScreen();
    const dialog = await openSheet('김민재 등번호 7번 바꾸기');
    const input = within(dialog).getByLabelText('등번호');
    expect(input).toHaveValue('7');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '번호 지우고 저장' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(patches().map((r) => [r.path, r.body])).toEqual([[jerseyPath(kim.participantId), { jerseyNumber: null }]]);
    expect(await screen.findByRole('button', { name: '김민재 등번호 넣기' })).toBeInTheDocument();
  });

  it('숫자가 아닌 입력은 저장할 수 없고 요청도 나가지 않는다', async () => {
    renderScreen();
    const dialog = await openSheet('한도윤 등번호 넣기');
    fireEvent.change(within(dialog).getByLabelText('등번호'), { target: { value: 'e7' } });
    expect(within(dialog).getByRole('alert')).toHaveTextContent('0에서 99 사이 숫자로 입력해 주세요.');
    expect(within(dialog).getByRole('button', { name: '저장' })).toBeDisabled();
    expect(patches()).toHaveLength(0);
  });

  it('"저장하고 다음 선수"는 저장 전 순서로 번호 없는 다음 선수를 열고, 바뀐 게 없으면 저장 없이 넘어간다', async () => {
    mock.setJersey('player-2', null); // 번호 없는 선수: 박서준, 한도윤
    renderScreen();
    const dialog0 = await openSheet('박서준 등번호 넣기');
    fireEvent.change(within(dialog0).getByLabelText('등번호'), { target: { value: '9' } });
    fireEvent.click(within(dialog0).getByRole('button', { name: '저장하고 다음 선수 (한도윤)' }));

    expect(await screen.findByRole('heading', { name: '한도윤 등번호' })).toBeInTheDocument();
    const dialog = screen.getByRole('dialog');
    expect(patches().map((r) => [r.path, r.body])).toEqual([[jerseyPath(park.participantId), { jerseyNumber: 9 }]]);
    // 저장한 박서준(9번)은 번호가 생겼으니 넘어갈 곳이 남지 않는다.
    expect(within(dialog).queryByRole('button', { name: /다음 선수/ })).toBeNull();
  });

  it('바꾼 게 없으면 "다음 선수"는 저장 요청 없이 시트만 옮긴다', async () => {
    mock.setJersey('player-2', null);
    renderScreen();
    const dialog = await openSheet('박서준 등번호 넣기');
    fireEvent.click(within(dialog).getByRole('button', { name: '다음 선수 (한도윤)' }));
    expect(await screen.findByRole('heading', { name: '한도윤 등번호' })).toBeInTheDocument();
    expect(patches()).toHaveLength(0);
  });

  it('번호가 겹치면 누가 쓰는지 알려 주고, 그 선수의 번호부터 바꾸게 시트를 옮긴다', async () => {
    renderScreen();
    let dialog = await openSheet('한도윤 등번호 넣기');
    fireEvent.change(within(dialog).getByLabelText('등번호'), { target: { value: '7' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '7번으로 저장' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('7번은 김민재가 쓰고 있어요. 다른 번호를 넣어 주세요.');
    expect(within(dialog).getByLabelText('등번호')).toHaveAttribute('aria-invalid', 'true');
    // 실패한 저장은 화면의 번호를 바꾸지 않는다.
    expect(screen.getByRole('button', { name: '김민재 등번호 7번 바꾸기' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '한도윤 등번호 넣기' })).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: '김민재의 번호부터 바꾸기' }));
    dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: '김민재 등번호' })).toBeInTheDocument();
    expect(within(dialog).getByLabelText('등번호')).toHaveValue('7');
  });

  it('입력을 고치면 겹침 안내가 사라진다', async () => {
    renderScreen();
    const dialog = await openSheet('한도윤 등번호 넣기');
    const input = within(dialog).getByLabelText('등번호');
    fireEvent.change(input, { target: { value: '10' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '10번으로 저장' }));
    await within(dialog).findByText(/10번은 박서준이 쓰고 있어요/);
    fireEvent.change(input, { target: { value: '11' } });
    expect(within(dialog).queryByRole('alert')).toBeNull();
  });

  it('화면을 연 뒤 명단이 잠겨 거절되면 서버 안내를 보이고 시트를 닫지 않는다', async () => {
    renderScreen();
    const dialog = await openSheet('한도윤 등번호 넣기');
    mock.lockRoster();
    fireEvent.change(within(dialog).getByLabelText('등번호'), { target: { value: '9' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '9번으로 저장' }));
    expect(await within(dialog).findByText('명단이 잠겼어요. 운영진에게 문의해 주세요.')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '한도윤 등번호 넣기' })).toBeInTheDocument();
  });
});

describe('대조군 — 번호 칸이 버튼이 아닌 경우', () => {
  it('이미 잠긴 명단은 번호 칸이 버튼이 아니고 잠긴 이유를 안내한다(2026-10 알파 실측)', async () => {
    mock.lockRoster();
    renderScreen();
    expect(await screen.findByText(/대회 참가 명단이 마감돼 번호를 바꿀 수 없어요\. 운영진에게 문의해 주세요\./)).toBeInTheDocument();
    expect(jerseyButtons()).toHaveLength(0);
  });

  it('일반 팀원은 번호를 글자로만 보고 등번호 버튼이 없다', async () => {
    mock.setViewerRole('TEAM_MEMBER');
    renderScreen();
    await screen.findByRole('heading', { name: '출전 3명' });
    expect(jerseyButtons()).toHaveLength(0);
    expect(screen.getByText('7 김민재')).toBeInTheDocument();
    expect(screen.queryByText(/번호 칸을 눌러/)).toBeNull();
  });

  it.each(['ADMIN', 'STAFF'] as const)('명단을 편집하는 운영자(%s)에게도 등번호 버튼은 없다 — 저장 API 는 팀장·매니저 전용', async (role) => {
    mock.setViewerRole(role);
    renderScreen();
    expect(await screen.findByRole('checkbox', { name: '김민재 이번 경기 출전' })).toBeInTheDocument();
    expect(jerseyButtons()).toHaveLength(0);
    expect(screen.queryByText(/번호 칸을 눌러/)).toBeNull();
  });

  it('이미 시작한 경기는 번호가 읽기 전용이고 이유를 말한다', async () => {
    mock.setGameState(G1.gameId, 'LIVE');
    renderScreen();
    await screen.findByText('경기 시작됨');
    expect(jerseyButtons()).toHaveLength(0);
    expect(screen.getByText('경기가 시작돼 이 경기의 번호는 바꿀 수 없어요.')).toBeInTheDocument();
    expect(screen.getByText('7 김민재')).toBeInTheDocument();
  });

  it.each(['TEAM_MEMBER', 'ADMIN', 'STAFF'] as const)(
    '참가 명단이 없는 팀이어도 팀장·매니저가 아닌 %s 에게는 등번호 버튼이 없다',
    async (role) => {
      mock.useTeamMembersFallback();
      mock.setViewerRole(role);
      renderScreen();
      await screen.findByRole('heading', { name: '출전 3명' });
      expect(jerseyButtons()).toHaveLength(0);
    },
  );

  it('시작한 경기의 이유 문구는 팀원에게 뜨지 않는다(고칠 수 있던 적이 없다)', async () => {
    mock.setViewerRole('TEAM_MEMBER');
    mock.setGameState(G1.gameId, 'LIVE');
    renderScreen();
    await screen.findByText('경기 시작됨');
    expect(screen.queryByText(/이 경기의 번호는 바꿀 수 없어요/)).toBeNull();
  });

  it('참가 명단이 없는 리그 팀은 칸을 눌러도 입력 대신 이유와 참가 명단으로 가는 길을 준다', async () => {
    mock.useTeamMembersFallback();
    renderScreen();
    const dialog = await openSheet('김민재 등번호 넣기');
    expect(within(dialog).getByRole('heading', { name: '등번호를 넣을 수 없어요' })).toBeInTheDocument();
    expect(within(dialog).getByText(/참가 명단을 내지 않아서 팀원 전체가 기준이에요/)).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: '참가 명단 내러 가기' })).toHaveAttribute(
      'href',
      expect.stringMatching(new RegExp(`^/tournaments/${tournamentId}/my`)),
    );
    expect(within(dialog).queryByLabelText('등번호')).toBeNull();
    expect(patches()).toHaveLength(0);
    // 저장할 원본이 없는 팀에는 "참가 명단에 저장돼요" 안내를 달지 않는다.
    expect(screen.queryByText(/번호 칸을 눌러 등번호를 넣어요/)).toBeNull();
  });
});
