import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { v1Keys } from '@/lib/query-keys';
import { makeBracket, makeFixture, makeGroup } from '@/test/bracket-canvas-fixtures';
import type { V1AdminTournamentBracket } from '@/types/api';
import { BracketFixtureToolsDialog } from './bracket-fixture-tools-dialog';

const bodies: unknown[] = [];
let failNext = false;
let serverBracket: V1AdminTournamentBracket;
const server = setupServer(
  http.post('*/api/v1/logs/client-error', () => HttpResponse.json({ status: 'success', data: null })),
  http.get('*/api/v1/admin/tournaments/:id/bracket', () => HttpResponse.json({ status: 'success', data: serverBracket, timestamp: '2026-10-10T00:00:00Z' })),
  http.post('*/api/v1/admin/tournaments/:id/fixtures', async ({ request }) => {
    bodies.push(await request.json());
    await delay(30);
    if (failNext) {
      return HttpResponse.json({ status: 'error', statusCode: 409, code: 'LEAGUE_ON_HOLD', message: 'on hold' }, { status: 409 });
    }
    return HttpResponse.json({ status: 'success', data: { id: 'new-1' }, timestamp: '2026-10-10T00:00:00Z' });
  }),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  bodies.length = 0;
  failNext = false;
});
afterAll(() => server.close());

const gA = makeGroup({ id: 'gA', name: 'A조', phase: 'group', sortOrder: 0 });
const gB = makeGroup({ id: 'gB', name: 'B조', phase: 'group', sortOrder: 1 }); // 경기 0개인 빈 조
const gSemi = makeGroup({ id: 'gS', name: '4강', phase: 'semi', sortOrder: 2 });
const numbered = makeBracket({
  groups: [gA, gB, gSemi],
  fixtures: [
    makeFixture({ id: 'a1', groupId: 'gA', fixtureNumber: 1, round: 'league_r1' }),
    makeFixture({ id: 'a2', groupId: 'gA', fixtureNumber: 2, round: 'league_r2' }),
    makeFixture({ id: 'a10', groupId: 'gA', fixtureNumber: 9, round: 'league_r10' }),
  ],
});
const NO_GROUP_NOTICE = '조별 리그 조가 없어 경기를 추가할 수 없어요. 조 설정을 확인하거나 대진을 템플릿으로 다시 만들어 주세요.';

function renderLeagueDialog(bracket: V1AdminTournamentBracket = numbered) {
  serverBracket = bracket;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const props = { open: true, mode: 'add' as const, format: 'league' as const, tournamentId: 't-1', bracket, onClose: vi.fn(), showToast: vi.fn() };
  render(
    <QueryClientProvider client={client}>
      <BracketFixtureToolsDialog {...props} />
    </QueryClientProvider>,
  );
  return { props, client };
}

const optionTexts = (select: HTMLElement) => within(select).getAllByRole('option').map((option) => option.textContent);

describe('BracketFixtureToolsDialog — 리그 경기 추가', () => {
  it('리그 조만 sortOrder 순으로, 라운드는 숫자 순서 + 새 라운드로 보여 주고 기본은 마지막 기존 라운드다', () => {
    renderLeagueDialog();
    expect(optionTexts(screen.getByLabelText('조'))).toEqual(['A조', 'B조']);
    const round = screen.getByLabelText('라운드') as HTMLSelectElement;
    expect(optionTexts(round)).toEqual(['1라운드', '2라운드', '10라운드', '새 라운드 (11라운드)']);
    expect(round.selectedOptions[0].textContent).toBe('10라운드');
    expect(screen.queryByText('경기를 추가할 수 있는 단계가 없어요. 템플릿으로 대진을 먼저 만들어 주세요.')).not.toBeInTheDocument();
  });

  it('새 라운드를 고르면 groupId·league_r{N+1}·다음 경기 번호를 보내고, 알린 뒤 닫고, 대진 캐시를 무효화한다', async () => {
    const { props, client } = renderLeagueDialog();
    const key = v1Keys.adminTournamentBracket('t-1');
    client.setQueryData(key, numbered);
    fireEvent.change(screen.getByLabelText('라운드'), { target: { value: 'new' } });
    fireEvent.click(screen.getByRole('button', { name: '경기 추가' }));
    await waitFor(() => expect(props.onClose).toHaveBeenCalledTimes(1));
    expect(bodies).toEqual([{ groupId: 'gA', round: 'league_r11', fixtureNumber: 10 }]);
    expect(props.showToast).toHaveBeenCalledWith('11라운드 A조 경기를 추가했어요. 칸을 눌러 팀을 넣어 주세요.', 'success');
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  });

  it('화면 캐시가 낡아도 서버의 최신 대진에서 다음 경기 번호를 정한다', async () => {
    const { props } = renderLeagueDialog();
    // 다른 어드민이 그사이 9번 뒤로 두 경기를 더 추가했다
    serverBracket = makeBracket({
      groups: [gA, gB, gSemi],
      fixtures: [...numbered.fixtures, makeFixture({ id: 'a11', groupId: 'gA', fixtureNumber: 10, round: 'league_r10' }), makeFixture({ id: 'a12', groupId: 'gB', fixtureNumber: 11, round: 'league_r10' })],
    });
    fireEvent.click(screen.getByRole('button', { name: '경기 추가' }));
    await waitFor(() => expect(props.onClose).toHaveBeenCalledTimes(1));
    expect(bodies).toEqual([{ groupId: 'gA', round: 'league_r10', fixtureNumber: 12 }]);
  });

  it('서버가 같은 경기 번호를 다른 내용으로 이미 처리했다고 답하면 다시 불러 오라고 안내하고 닫지 않는다', async () => {
    server.use(
      http.post('*/api/v1/admin/tournaments/:id/fixtures', () =>
        HttpResponse.json({ status: 'error', statusCode: 409, code: 'COMMAND_IDEMPOTENCY_PAYLOAD_REUSE', message: 'reuse' }, { status: 409 }),
      ),
    );
    const { props } = renderLeagueDialog();
    fireEvent.click(screen.getByRole('button', { name: '경기 추가' }));
    await waitFor(() =>
      expect(props.showToast).toHaveBeenCalledWith('그사이 다른 경기가 먼저 추가됐어요. 대진을 새로 불러온 뒤 다시 눌러 주세요.', 'error'),
    );
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('빈 조에 기존 라운드로 넣는다', async () => {
    const { props } = renderLeagueDialog();
    fireEvent.change(screen.getByLabelText('조'), { target: { value: 'gB' } });
    fireEvent.change(screen.getByLabelText('라운드'), { target: { value: 'r2' } });
    fireEvent.click(screen.getByRole('button', { name: '경기 추가' }));
    await waitFor(() => expect(props.onClose).toHaveBeenCalled());
    expect(bodies).toEqual([{ groupId: 'gB', round: 'league_r2', fixtureNumber: 10 }]);
    expect(props.showToast).toHaveBeenCalledWith('2라운드 B조 경기를 추가했어요. 칸을 눌러 팀을 넣어 주세요.', 'success');
  });

  it('템플릿으로 만든 리그(조 `리그` 하나, 자리 연결 경기)에도 기존·새 라운드로 추가되고 토스트에 조 이름이 들어간다', async () => {
    const league = makeGroup({ id: 'gL', name: '리그', phase: 'group', sortOrder: 0 });
    const slotted = makeBracket({
      groups: [league],
      fixtures: [1, 2, 3].map((n) =>
        makeFixture({ id: `s${n}`, groupId: 'gL', fixtureNumber: n, round: `league_r${n}`, homeSlotId: `h${n}`, awaySlotId: `a${n}` }),
      ),
    });
    const { props } = renderLeagueDialog(slotted);
    expect(optionTexts(screen.getByLabelText('조'))).toEqual(['리그']);
    fireEvent.change(screen.getByLabelText('라운드'), { target: { value: 'r1' } });
    fireEvent.click(screen.getByRole('button', { name: '경기 추가' }));
    await waitFor(() => expect(props.onClose).toHaveBeenCalledTimes(1));
    expect(bodies).toEqual([{ groupId: 'gL', round: 'league_r1', fixtureNumber: 4 }]);
    expect(props.showToast).toHaveBeenCalledWith('1라운드 리그 경기를 추가했어요. 칸을 눌러 팀을 넣어 주세요.', 'success');
  });

  it('연속으로 두 번 눌러도 요청은 한 건이다', async () => {
    const { props } = renderLeagueDialog();
    const button = screen.getByRole('button', { name: '경기 추가' });
    fireEvent.click(button);
    fireEvent.click(button); // isPending 은 핸들러가 끝난 뒤에야 true 라 두 번째 클릭도 핸들러까지 온다 — 동기 잠금이 막아야 한다
    await waitFor(() => expect(props.onClose).toHaveBeenCalledTimes(1));
    expect(bodies).toHaveLength(1);
  });

  it('실패하면 서버 코드에 맞는 에러 토스트를 보이고 닫지 않으며 다시 누를 수 있다', async () => {
    failNext = true;
    const { props } = renderLeagueDialog();
    fireEvent.click(screen.getByRole('button', { name: '경기 추가' }));
    await waitFor(() => expect(props.showToast).toHaveBeenCalledWith('보류 중인 리그라 대진을 바꿀 수 없어요.', 'error'));
    expect(props.onClose).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole('button', { name: '경기 추가' })).toBeEnabled());
    failNext = false;
    fireEvent.click(screen.getByRole('button', { name: '경기 추가' }));
    await waitFor(() => expect(props.onClose).toHaveBeenCalledTimes(1));
    expect(bodies).toHaveLength(2); // 실패 뒤 잠금이 풀려 재시도 요청이 나간다
  });

  it('번호가 없는 옛 대진은 라운드 선택 없이 옛 round 값을 이어 쓴다', async () => {
    const legacy = makeBracket({
      groups: [gA, gB],
      fixtures: [1, 2, 3].map((n) => makeFixture({ id: `f${n}`, groupId: 'gA', fixtureNumber: n, round: '조별 리그' })),
    });
    const { props } = renderLeagueDialog(legacy);
    expect(screen.queryByLabelText('라운드')).not.toBeInTheDocument();
    expect(screen.getByText('라운드 정보가 없는 대진이라 이 조의 마지막 경기 뒤에 붙어요.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('조'), { target: { value: 'gB' } });
    fireEvent.click(screen.getByRole('button', { name: '경기 추가' }));
    await waitFor(() => expect(props.onClose).toHaveBeenCalled());
    expect(bodies).toEqual([{ groupId: 'gB', round: '조별 리그', fixtureNumber: 4 }]);
    expect(props.showToast).toHaveBeenCalledWith('B조 경기를 추가했어요. 칸을 눌러 팀을 넣어 주세요.', 'success');
  });

  it.each([
    ['결선 단계 조뿐인 대진', makeBracket({ groups: [gSemi], fixtures: [] })],
    ['조 없이 경기만 있는 대진(조 미정 열)', makeBracket({ groups: [], fixtures: [makeFixture({ id: 'u1', groupId: null, fixtureNumber: 1, round: 'league_r1' })] })],
  ])('리그 조가 하나도 없으면(%s) 안내하고 버튼을 막는다', (_name, bracket) => {
    renderLeagueDialog(bracket);
    expect(screen.getByText(NO_GROUP_NOTICE)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '경기 추가' })).toBeDisabled();
  });
});
