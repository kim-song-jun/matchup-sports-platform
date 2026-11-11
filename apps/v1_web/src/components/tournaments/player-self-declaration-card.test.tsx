import { transferableAbortController } from 'node:util';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useV1TournamentPlayers } from '@/hooks/use-v1-api';
import {
  createV1PlayerEligibilityMswHandlers,
  playerEligibilityRosterPlayer,
} from '@/test/msw/player-eligibility-handlers';
import { PlayerSelfDeclarationCard } from './player-self-declaration-card';

/** MD-QA #192 ③ — 선수 본인 선출 여부 신고. 실제 훅 + HTTP 계약(MSW)으로 본다. */
const server = setupServer();
let mock: ReturnType<typeof createV1PlayerEligibilityMswHandlers>;

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => {
  cleanup();
  server.resetHandlers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function setup(overrides: Parameters<typeof playerEligibilityRosterPlayer>[0] = {}) {
  mock = createV1PlayerEligibilityMswHandlers({
    tournamentId: 't-1',
    registrationId: 'reg-1',
    viewerUserId: 'user-me',
    players: [playerEligibilityRosterPlayer(overrides)],
  });
  server.use(
    http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })),
    ...mock.handlers,
  );
}

function Harness() {
  const roster = useV1TournamentPlayers('t-1', 'reg-1');
  const me = roster.data?.players.find((player) => player.isViewer);
  if (!me) return null;
  return <PlayerSelfDeclarationCard tournamentId="t-1" registrationId="reg-1" player={me} />;
}

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>);
}

beforeEach(() => {
  vi.stubGlobal('AbortController', function NativeAbortController() {
    return transferableAbortController();
  });
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
});

describe('PlayerSelfDeclarationCard', () => {
  it('허위 신고 안내에 동의하지 않으면 보내지 않고, 동의하면 본인 신고를 저장한다', async () => {
    setup();
    const user = userEvent.setup();
    mount();

    await user.click(await screen.findByRole('radio', { name: '선출' }));
    await user.click(screen.getByRole('button', { name: '선출 여부 신고하기' }));
    expect(screen.getByRole('alert')).toHaveTextContent('허위 신고 안내를 확인하고 동의해 주세요.');
    expect(mock.requests).toEqual([]);

    await user.click(screen.getByRole('checkbox', { name: '허위로 신고하면 대회 규정에 따라 출전 제한·실격이 될 수 있어요.' }));
    await user.click(screen.getByRole('button', { name: '선출 여부 신고하기' }));

    await waitFor(() => expect(mock.requests).toEqual([
      { method: 'PATCH', path: 'self-declaration/player-me', body: { selfDeclaredStatus: 'pro', consent: true } },
    ]));
    expect(await screen.findByText(/선출로 신고했어요/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다시 신고하기' })).toBeInTheDocument();
  });

  it('선출 기준 문장과 JoinKFA 링크를 함께 보여 준다', async () => {
    setup();
    mount();

    expect(await screen.findByText(/KFA 등록 이력\(JoinKFA\)으로 확인하고, 세부 기준은 대회 요강을 따라요\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /JoinKFA에서 등록 이력 보기/ })).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('운영진이 판정한 뒤에는 신고 폼 대신 잠금 표시만 보인다', async () => {
    setup({ eligibilityAdminReviewed: true, eligibilityStatus: 'non_pro', eligibilityVerificationMethod: null });
    mount();

    expect(await screen.findByText('운영진 확인 완료')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /신고하기/ })).not.toBeInTheDocument();
  });

  it('서버가 거절하면(이미 판정됨) 이유를 보여 준다', async () => {
    setup();
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole('radio', { name: '아마추어' }));
    await user.click(screen.getByRole('checkbox'));
    // 그 사이 운영진이 판정했다.
    mock.players[0].eligibilityAdminReviewed = true;
    await user.click(screen.getByRole('button', { name: '선출 여부 신고하기' }));

    expect(await screen.findByText('운영진이 확정한 선출 여부예요. 변경이 필요하면 운영진에게 문의해 주세요.')).toBeInTheDocument();
  });
});
