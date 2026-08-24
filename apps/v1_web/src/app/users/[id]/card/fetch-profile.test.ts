import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchPublicProfileForOg } from './fetch-profile';

/**
 * 이 헬퍼의 계약은 **절대 던지지 않는다**는 것 하나다.
 *
 * 링크 미리보기 이미지가 예외로 죽으면 카카오톡에 깨진 썸네일이 뜨고, 그건 링크를
 * 안 눌리게 만든다 -- 카드를 만든 목적이 공유인데 공유 지점에서 실패하는 셈이다.
 * 호출부가 브랜드 이미지로 대체할 수 있도록 null 을 돌려줘야 한다.
 */

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('fetchPublicProfileForOg', () => {
  it('정상 응답의 data 를 꺼내 준다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { userId: 'u-1', displayName: '김선준' } }),
      }),
    );

    await expect(fetchPublicProfileForOg('u-1')).resolves.toEqual({ userId: 'u-1', displayName: '김선준' });
  });

  it('404 면 null 을 준다 -- 던지지 않는다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }));

    await expect(fetchPublicProfileForOg('missing')).resolves.toBeNull();
  });

  it('네트워크가 죽어도 null 을 준다 -- 미리보기가 깨진 썸네일이 되지 않게', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    await expect(fetchPublicProfileForOg('u-1')).resolves.toBeNull();
  });

  it('본문이 비정상이어도 null 을 준다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new SyntaxError('Unexpected token');
        },
      }),
    );

    await expect(fetchPublicProfileForOg('u-1')).resolves.toBeNull();
  });

  it('내부 API origin 을 환경변수에서 읽어 공개 엔드포인트를 때린다', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: null }) });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('INTERNAL_API_ORIGIN', 'http://v1_api:8121/');

    await fetchPublicProfileForOg('u-9');

    // 끝의 슬래시가 중복되면 경로가 //api/v1 이 되어 라우팅이 어긋난다.
    expect(fetchMock).toHaveBeenCalledWith(
      'http://v1_api:8121/api/v1/users/u-9/public-profile',
      expect.objectContaining({ next: { revalidate: 300 } }),
    );
  });
});
