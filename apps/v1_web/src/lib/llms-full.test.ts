import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchPublicV1 = vi.fn();

vi.mock('@/lib/seo', async () => {
  const actual = await vi.importActual<typeof import('@/lib/seo')>('@/lib/seo');
  return { ...actual, fetchPublicV1: (path: string) => fetchPublicV1(path) };
});

const { collectLlmsFullSnapshot } = await import('./llms-full');

beforeEach(() => {
  fetchPublicV1.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const page = (items: unknown[]) => ({ items, nextCursor: null, pageInfo: { hasNext: false, nextCursor: null } });

describe('collectLlmsFullSnapshot', () => {
  it('한 목록이 실패해도 나머지는 채우고, 실패한 섹션만 null 로 표시하며 로그를 남긴다', async () => {
    fetchPublicV1.mockImplementation(async (path: string) => {
      if (path.startsWith('/teams')) throw new Error('upstream 502');
      return page([{ id: path }]);
    });

    const snapshot = await collectLlmsFullSnapshot();

    expect(snapshot.teams).toBeNull();
    expect(snapshot.tournaments).toHaveLength(1);
    expect(snapshot.matches).toHaveLength(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('팀'), expect.any(Error));
  });

  it('pageInfo 의 커서를 따라 다음 페이지를 가져온다(최상위 nextCursor 는 null 이어도)', async () => {
    fetchPublicV1.mockImplementation(async (path: string) => {
      if (!path.startsWith('/teams')) return page([]);
      return path.includes('cursor=c2')
        ? page([{ id: 'b' }])
        : { items: [{ id: 'a' }], nextCursor: null, pageInfo: { hasNext: true, nextCursor: 'c2' } };
    });

    const snapshot = await collectLlmsFullSnapshot();

    expect(snapshot.teams?.map((team) => team.id)).toEqual(['a', 'b']);
  });
});
