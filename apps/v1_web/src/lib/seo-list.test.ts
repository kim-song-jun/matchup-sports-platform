/**
 * 이 헬퍼의 계약은 하나 — **업스트림이 흔들려도 목록 페이지를 500 으로 만들지 않는다.**
 * 서버 프리렌더는 크롤러용 보조 경로이고, 사용자 화면은 하이드레이션 후 클라이언트가
 * 다시 가져온다. 여기서 던지면 얻는 것 없이 사용자만 잃는다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchPublicV1 = vi.fn();

vi.mock('@/lib/seo', async () => {
  const actual = await vi.importActual<typeof import('@/lib/seo')>('@/lib/seo');
  return { ...actual, fetchPublicV1: (path: string) => fetchPublicV1(path) };
});

const { fetchSeoMasterSports, fetchSeoSeed } = await import('./seo-list');

beforeEach(() => {
  fetchPublicV1.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

// 이 프로젝트 vitest 설정에는 restoreMocks 가 없다 — 직접 되돌리지 않으면 console.error 가
// 이후 파일까지 벙어리로 남아 다른 테스트의 경고를 삼킨다.
afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchSeoSeed', () => {
  it('받은 경로를 그대로 요청하고 응답을 돌려준다', async () => {
    fetchPublicV1.mockResolvedValue({ items: [{ id: 'a' }], pageInfo: { hasNext: true, nextCursor: 'c' } });

    await expect(fetchSeoSeed('/matches', 'matches')).resolves.toEqual({ items: [{ id: 'a' }], pageInfo: { hasNext: true, nextCursor: 'c' } });
    expect(fetchPublicV1).toHaveBeenCalledWith('/matches');
  });

  it('업스트림이 죽어도 던지지 않고 null 을 준다 — 빈 목록을 사실처럼 넘기지 않는다', async () => {
    fetchPublicV1.mockRejectedValue(new Error('upstream down'));

    await expect(fetchSeoSeed('/teams?limit=20', 'teams')).resolves.toBeNull();
  });

  it('실패를 조용히 삼키지 않고 서버 로그에 남긴다', async () => {
    fetchPublicV1.mockRejectedValue(new Error('boom'));

    await fetchSeoSeed('/teams?limit=20', 'teams');

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('teams'),
      expect.any(Error),
    );
  });

  it('응답이 없으면(404) null', async () => {
    fetchPublicV1.mockResolvedValue(null);

    await expect(fetchSeoSeed('/team-matches', 'team-matches')).resolves.toBeNull();
  });
});

describe('fetchSeoMasterSports', () => {
  it('공개 마스터 API 의 sports 배열을 그대로 준다', async () => {
    fetchPublicV1.mockResolvedValue({ sports: [{ id: 'a', name: '풋살', levels: [] }] });

    await expect(fetchSeoMasterSports()).resolves.toEqual([{ id: 'a', name: '풋살', levels: [] }]);
    expect(fetchPublicV1).toHaveBeenCalledWith('/master/sports');
  });

  it('배열 형태 응답도 받는다', async () => {
    fetchPublicV1.mockResolvedValue([{ id: 'a', name: '풋살', levels: [] }]);

    await expect(fetchSeoMasterSports()).resolves.toEqual([{ id: 'a', name: '풋살', levels: [] }]);
  });

  it('실패해도 던지지 않는다 — 칩보다 목록 본문이 중요하다', async () => {
    fetchPublicV1.mockRejectedValue(new Error('down'));

    await expect(fetchSeoMasterSports()).resolves.toEqual([]);
  });
});
