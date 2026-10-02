import { MutationObserver, QueryObserver, type QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { V1_OFFLINE_WRITE_MESSAGE, v1Get, v1Post } from './api-client';
import * as clientErrorReporter from './client-error-reporter';
import { extractErrorMessage } from './error-message';
import { createV1QueryClient } from './query-client';

// W6-V1: 오프라인에서 누른 쓰기가 말없이 멈췄다가 연결되면 뒤늦게 저장됐다.
const FALLBACK = '참석 여부를 바꾸지 못했어요.';
type FakeResponse = { ok: boolean; status: number; json: () => Promise<unknown> };

let online = true;
let serverResponse: FakeResponse;
let client: QueryClient;
// 브라우저는 오프라인이면 요청을 응답 없이 reject 한다 — 그 동작만 흉내 낸다.
const fetchMock = vi.fn(() => (online ? Promise.resolve(serverResponse) : Promise.reject(new TypeError('Failed to fetch'))));

function setConnection(next: boolean) {
  online = next;
  window.dispatchEvent(new Event(next ? 'online' : 'offline'));
}
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const rejection = (promise: Promise<unknown>) => promise.then(() => { throw new Error('실패해야 한다'); }, (error: unknown) => error);
const attend = () => v1Post('/teams/team-1/schedules/schedule-1/attendance', { status: 'GOING' });

beforeEach(() => {
  online = true;
  serverResponse = { ok: true, status: 200, json: async () => ({ status: 'success', data: { saved: true }, timestamp: '' }) };
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(window.navigator, 'onLine', 'get').mockImplementation(() => online);
  vi.spyOn(clientErrorReporter, 'reportClientError').mockImplementation(() => {});
  client = createV1QueryClient();
  client.mount();
});

afterEach(() => {
  setConnection(true); // onlineManager 는 모듈 전역이라 다음 테스트로 오프라인이 새지 않게 되돌린다.
  client.unmount();
  client.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('createV1QueryClient — 쓰기', () => {
  it('오프라인에서 누른 쓰기는 기다리지 않고 바로 실패해 연결 문구를 보여 주고, 연결이 돌아와도 저절로 보내지 않는다', async () => {
    setConnection(false);
    const observer = new MutationObserver(client, { mutationFn: attend });
    const failure = rejection(observer.mutate());

    await vi.waitFor(() => expect(observer.getCurrentResult().status).toBe('error'));
    expect(extractErrorMessage(await failure, FALLBACK)).toBe(V1_OFFLINE_WRITE_MESSAGE);

    setConnection(true);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(observer.getCurrentResult()).toMatchObject({ status: 'error', isPaused: false });
  });

  it('대조군 — 온라인 쓰기는 종전대로 보내고, 실패해도 다시 보내지 않으며 서버 메시지·본문 없는 5xx 문구도 그대로다', async () => {
    const observer = new MutationObserver(client, { mutationFn: attend });
    await expect(observer.mutate()).resolves.toEqual({ saved: true });

    serverResponse = {
      ok: false,
      status: 409,
      json: async () => ({ status: 'error', statusCode: 409, code: 'SCHEDULE_TERMINAL', message: '이미 종료된 일정이에요.', timestamp: '' }),
    };
    expect(extractErrorMessage(await rejection(observer.mutate()), FALLBACK)).toBe('이미 종료된 일정이에요.');

    serverResponse = { ok: false, status: 502, json: async () => { throw new SyntaxError('Unexpected token <'); } };
    expect(extractErrorMessage(await rejection(observer.mutate()), FALLBACK)).toBe(FALLBACK);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe('createV1QueryClient — 조회', () => {
  it('대조군 — 조회는 종전대로 오프라인이면 실패하지 않고 멈췄다가 연결되면 가져온다', async () => {
    setConnection(false);
    const observer = new QueryObserver(client, { queryKey: ['v1', 'test', 'offline-read'], queryFn: () => v1Get('/teams') });
    const unsubscribe = observer.subscribe(() => {});

    await vi.waitFor(() => expect(observer.getCurrentResult().fetchStatus).toBe('paused'));
    expect(fetchMock).not.toHaveBeenCalled();

    setConnection(true);
    await vi.waitFor(() => expect(observer.getCurrentResult().status).toBe('success'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});
