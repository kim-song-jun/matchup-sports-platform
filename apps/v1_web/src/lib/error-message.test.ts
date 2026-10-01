import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  V1ApiError,
  V1_OFFLINE_WRITE_MESSAGE,
  isV1NetworkError,
  retryTransientFailure,
  v1Get,
  v1MultipartPost,
  v1Post,
} from './api-client';
import * as clientErrorReporter from './client-error-reporter';
import { extractErrorCode, extractErrorMessage } from './error-message';

// W4-V7: 배포 교체 중 502(본문 HTML)가 오면 해체 화면에 영어 "Request failed" 가 그대로 떴다.
describe('extractErrorMessage — 서버가 메시지를 주지 않은 실패만 해요체 fallback', () => {
  const FALLBACK = '팀을 해체하지 못했어요. 잠시 후 다시 시도해 주세요.';
  type FakeResponse = { ok: boolean; status: number; statusText?: string; json: () => Promise<unknown> };

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function stubFetch(response: FakeResponse) {
    const report = vi.spyOn(clientErrorReporter, 'reportClientError').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    return report;
  }
  const rejection = (promise: Promise<unknown>) => promise.then(() => { throw new Error('실패해야 한다'); }, (error: unknown) => error);
  const htmlBody = async () => { throw new SyntaxError('Unexpected token <'); };
  const envelope = (statusCode: number, message?: unknown) => async () => ({
    status: 'error', statusCode, code: 'SOME_CODE', timestamp: '2026-10-01T00:00:00.000Z', ...(message === undefined ? {} : { message }),
  });

  it('본문 없는 502 는 fallback 을 보여 주고, 로그에는 진단용 자리표시를 그대로 남긴다', async () => {
    const report = stubFetch({ ok: false, status: 502, statusText: '', json: htmlBody });
    const error = await rejection(v1Post('/teams/team-1/dissolve', {}));

    expect(extractErrorMessage(error, FALLBACK)).toBe(FALLBACK);
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ message: 'Request failed' }));
  });

  it('HTTP 상태 문구(Bad Gateway)나 message 없는 에러 봉투도 서버 메시지가 아니다', async () => {
    stubFetch({ ok: false, status: 502, statusText: 'Bad Gateway', json: htmlBody });
    expect(extractErrorMessage(await rejection(v1Post('/teams/team-1/dissolve', {})), FALLBACK)).toBe(FALLBACK);

    stubFetch({ ok: false, status: 500, json: envelope(500) });
    expect(extractErrorMessage(await rejection(v1Post('/teams/team-1/dissolve', {})), FALLBACK)).toBe(FALLBACK);
  });

  it('업로드도 에러 봉투가 아닌 실패면 fallback 이다', async () => {
    stubFetch({ ok: false, status: 502, statusText: 'Bad Gateway', json: htmlBody });
    expect(extractErrorMessage(await rejection(v1MultipartPost('/uploads', new FormData())), FALLBACK)).toBe(FALLBACK);
  });

  it('응답이 아예 없으면(fetch reject) "Failed to fetch" 대신 fallback 이고, 원래 오류는 cause 로 남는다', async () => {
    const offline = new TypeError('Failed to fetch');
    vi.spyOn(clientErrorReporter, 'reportClientError').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(offline));

    const error = await rejection(v1Post('/teams/team-1/dissolve', {}));
    expect(error).toBeInstanceOf(V1ApiError);
    expect(error).toMatchObject({ statusCode: 0, code: 'NETWORK_ERROR', cause: offline });
    expect(extractErrorMessage(error, FALLBACK)).toBe(FALLBACK);
    expect(extractErrorMessage(await rejection(v1MultipartPost('/uploads', new FormData())), FALLBACK)).toBe(FALLBACK);
  });

  // W6-V1: 오프라인 쓰기는 기다리지 않고 바로 실패한다 — 그 실패가 이유와 할 일을 말해야 한다.
  it('브라우저가 오프라인이면 응답 없는 쓰기 실패는 연결 문구를 보여 주고, 네트워크 실패 분류는 그대로다', async () => {
    const offline = new TypeError('Failed to fetch');
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(offline));

    const error = await rejection(v1Post('/teams/team-1/dissolve', {}));
    expect(extractErrorMessage(error, FALLBACK)).toBe(V1_OFFLINE_WRITE_MESSAGE);
    expect(error).toMatchObject({ statusCode: 0, code: 'NETWORK_ERROR', cause: offline });
    expect(isV1NetworkError(error)).toBe(true);
    expect(retryTransientFailure(0, error)).toBe(true);
    expect(extractErrorMessage(await rejection(v1MultipartPost('/uploads', new FormData())), FALLBACK)).toBe(V1_OFFLINE_WRITE_MESSAGE);
  });

  it('대조군 — 오프라인이어도 조회 실패, 응답이 온 실패(본문 없는 502·서버 메시지)는 종전대로다', async () => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    expect(extractErrorMessage(await rejection(v1Get('/teams/team-1')), FALLBACK)).toBe(FALLBACK);

    stubFetch({ ok: false, status: 502, statusText: 'Bad Gateway', json: htmlBody });
    expect(extractErrorMessage(await rejection(v1Post('/teams/team-1/dissolve', {})), FALLBACK)).toBe(FALLBACK);

    stubFetch({ ok: false, status: 403, json: envelope(403, '팀장만 팀을 해체하거나 복구할 수 있어요.') });
    expect(extractErrorMessage(await rejection(v1Post('/teams/team-1/dissolve', {})), FALLBACK)).toBe('팀장만 팀을 해체하거나 복구할 수 있어요.');
  });

  it('대조군 — 요청 취소(AbortError·취소된 signal)는 감싸지 않고 그대로 던진다', async () => {
    const abort = new DOMException('The operation was aborted.', 'AbortError');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abort));
    expect(await rejection(v1Post('/teams/team-1/dissolve', {}))).toBe(abort);
    expect(await rejection(v1MultipartPost('/uploads', new FormData()))).toBe(abort);

    const controller = new AbortController();
    const reason = new Error('명령 응답 제한 시간 초과');
    controller.abort(reason);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(reason));
    expect(await rejection(v1Post('/games/g-1/commands/end', {}, { signal: controller.signal }))).toBe(reason);
  });

  it('대조군 — 서버가 준 메시지(문장·검증 메시지 배열)는 종전대로 그대로 보여 준다', async () => {
    stubFetch({ ok: false, status: 403, json: envelope(403, '팀장만 팀을 해체하거나 복구할 수 있어요.') });
    expect(extractErrorMessage(await rejection(v1Post('/teams/team-1/dissolve', {})), FALLBACK)).toBe('팀장만 팀을 해체하거나 복구할 수 있어요.');

    stubFetch({ ok: false, status: 400, json: envelope(400, ['이름을 입력해 주세요', '사유를 입력해 주세요']) });
    expect(extractErrorMessage(await rejection(v1Post('/teams/team-1/dissolve', {})), FALLBACK)).toBe('이름을 입력해 주세요, 사유를 입력해 주세요');

    stubFetch({ ok: false, status: 413, json: envelope(413, '파일이 너무 커요.') });
    expect(extractErrorMessage(await rejection(v1MultipartPost('/uploads', new FormData())), FALLBACK)).toBe('파일이 너무 커요.');
  });

  it('대조군 — API 밖에서 던진 일반 Error 의 문장은 종전대로 보여 준다', () => {
    expect(extractErrorMessage(new Error('사진은 10MB 이하만 올릴 수 있어요.'), FALLBACK)).toBe('사진은 10MB 이하만 올릴 수 있어요.');
  });
});

describe('extractErrorCode', () => {
  it('V1ApiError 처럼 최상위 code 만 있는 에러는 그 값을 돌려준다', () => {
    expect(extractErrorCode({ code: 'VERIFICATION_RESEND_COOLDOWN' })).toBe(
      'VERIFICATION_RESEND_COOLDOWN',
    );
  });

  it('Axios 에러는 최상위 code(ERR_BAD_REQUEST) 가 아니라 응답 본문의 도메인 코드를 돌려준다', () => {
    // 순서를 뒤집으면 쿨다운을 오류로 오판해 빨간 배너가 뜬다 — 그 회귀를 여기서 고정한다.
    const axiosLike = {
      code: 'ERR_BAD_REQUEST',
      response: { data: { code: 'VERIFICATION_RESEND_COOLDOWN' } },
    };
    expect(extractErrorCode(axiosLike)).toBe('VERIFICATION_RESEND_COOLDOWN');
  });

  it('응답 본문에 코드가 없으면 최상위 code 로 폴백한다', () => {
    expect(extractErrorCode({ code: 'ECONNABORTED', response: { data: {} } })).toBe('ECONNABORTED');
  });

  it('코드를 찾을 수 없으면 null 이다 (호출부는 기본 오류 처리로 간다)', () => {
    expect(extractErrorCode(new Error('boom'))).toBeNull();
    expect(extractErrorCode(null)).toBeNull();
    expect(extractErrorCode('문자열 에러')).toBeNull();
  });
});
