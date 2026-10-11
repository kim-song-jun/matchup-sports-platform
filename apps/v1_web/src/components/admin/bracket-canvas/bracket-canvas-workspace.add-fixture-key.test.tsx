import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeBracket, makeFixture, makeGroup } from '@/test/bracket-canvas-fixtures';
import { installViewport } from '@/test/viewport';
import { BracketCanvasWorkspace } from './bracket-canvas-workspace';

// 워크스페이스·대화상자·훅·api-client 는 진짜이고 네트워크만 MSW 다 — 대화상자가 열 때마다 새로 마운트되는 실제 배선과
// 응답 모양(본문 없는 4xx·5xx, 연결 끊김)이 키 수명 판정에 어떻게 닿는지 본다.
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }) }));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminBracket: () => ({ data: bracketData, isPending: false, isError: false, error: null, refetch: vi.fn() }),
  useV1UpdateFixture: () => ({ mutate: vi.fn(), isPending: false }),
  useV1PublishTournamentBracket: () => ({ mutate: vi.fn(), isPending: false }),
  useV1UnpublishTournamentBracket: () => ({ mutate: vi.fn(), isPending: false }),
}));

const bracketData = makeBracket({
  groups: [makeGroup({ id: 'g-qf', name: '8강', phase: 'quarter', sortOrder: 0 }), makeGroup({ id: 'g-sf', name: '4강', phase: 'semi', sortOrder: 1 })],
  fixtures: [makeFixture({ id: 'q1', groupId: 'g-qf', fixtureNumber: 1 })],
});

type Reply = 'network' | 'html400' | 'html502' | 'json422' | 'ok';
const replies: Reply[] = [];
const bodies: Array<{ groupId: string; round: string; clientCommandId: string }> = [];
const server = setupServer(
  http.post('*/api/v1/logs/client-error', () => HttpResponse.json({ status: 'success', data: null })),
  http.post('*/api/v1/admin/tournaments/:id/fixtures', async ({ request }) => {
    bodies.push((await request.json()) as (typeof bodies)[number]);
    // 응답을 고르는 일은 지연 전에 한다 — 앞 테스트에서 아직 응답 중인 요청이 다음 테스트의 응답 대기열을 가져가지 못하게.
    const reply = replies.shift() ?? 'ok';
    await delay(20);
    if (reply === 'network') return HttpResponse.error();
    if (reply === 'html400') return new HttpResponse('<html>bad request</html>', { status: 400, headers: { 'content-type': 'text/html' } });
    if (reply === 'html502') return new HttpResponse('<html>bad gateway</html>', { status: 502, headers: { 'content-type': 'text/html' } });
    if (reply === 'json422') return HttpResponse.json({ status: 'error', statusCode: 422, code: 'SOME_CODE', message: 'x' }, { status: 422 });
    return HttpResponse.json({ status: 'success', data: { id: 'new-1', fixtureNumber: 2 }, timestamp: '2026-10-11T00:00:00Z' });
  }),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
let restoreViewport: (() => void) | null = null;
beforeEach(() => {
  restoreViewport = installViewport(1440);
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  replies.length = 0;
  bodies.length = 0;
  restoreViewport?.();
});
afterAll(() => server.close());

function renderWorkspace() {
  const showToast = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <BracketCanvasWorkspace
        tournamentId="t-1"
        format="knockout"
        registrations={[]}
        registrationsState={{ status: 'success', truncated: false, refetchFailed: false, error: null, onRetry: vi.fn() }}
        bracketPublishedAt={null}
        bracketPublishScheduledAt={null}
        canWrite
        showToast={showToast}
        onShowList={vi.fn()}
      />
    </QueryClientProvider>,
  );
  return showToast;
}

// 본문 없는 오류 응답은 처음 한 번 에러 리포팅 경로를 타서 기본 1초를 넘길 수 있다.
const settle = (assertion: () => void) => waitFor(assertion, { timeout: 5000 });
const openDialog = () => fireEvent.click(screen.getByRole('button', { name: '경기 추가' }));
const dialogAdd = () => fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '경기 추가' }));
const keys = () => bodies.map((body) => body.clientCommandId);

describe('「경기 추가」 요청 키 — 실제 전송 경로', () => {
  it('응답을 잃은 뒤 대화상자를 닫았다 다시 열어 같은 내용으로 추가해도 같은 키로 보낸다', async () => {
    replies.push('network');
    const showToast = renderWorkspace();
    openDialog();
    dialogAdd();
    await settle(() => expect(showToast).toHaveBeenCalledWith(expect.any(String), 'error'));

    fireEvent.click(screen.getByRole('button', { name: '모달 닫기' }));
    await settle(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    openDialog();
    dialogAdd();
    await settle(() => expect(showToast).toHaveBeenCalledWith(expect.stringContaining('경기를 추가했어요'), 'success'));

    expect(bodies).toHaveLength(2);
    expect(keys()[1]).toBe(keys()[0]);
  });

  it('대조군: 성공한 뒤 다시 열어 추가하면 새 키를 쓴다', async () => {
    const showToast = renderWorkspace();
    openDialog();
    dialogAdd();
    await settle(() => expect(showToast).toHaveBeenCalledWith(expect.stringContaining('경기를 추가했어요'), 'success'));
    await settle(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    openDialog();
    dialogAdd();
    await settle(() => expect(bodies).toHaveLength(2));
    await settle(() => expect(showToast).toHaveBeenCalledTimes(2));
    expect(keys()[1]).not.toBe(keys()[0]);
  });

  it.each([
    ['본문 없는 400(HTML)', false, 'html400'],
    ['본문 있는 422(JSON)', false, 'json422'],
    ['본문 없는 502(배포 중 게이트웨이)', true, 'html502'],
    ['연결 끊김', true, 'network'],
  ] as const)('%s 실패 뒤 다시 누르면 같은 키 재사용 = %s', async (_name, keepsKey, reply) => {
    replies.push(reply);
    const showToast = renderWorkspace();
    openDialog();
    dialogAdd();
    await settle(() => expect(showToast).toHaveBeenCalledWith(expect.any(String), 'error'));
    await settle(() => expect(within(screen.getByRole('dialog')).getByRole('button', { name: '경기 추가' })).toBeEnabled());
    dialogAdd();
    await settle(() => expect(bodies).toHaveLength(2));

    if (keepsKey) expect(keys()[1]).toBe(keys()[0]);
    else expect(keys()[1]).not.toBe(keys()[0]);
  });
});
