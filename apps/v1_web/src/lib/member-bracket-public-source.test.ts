import { describe, it, expect, vi, afterEach } from 'vitest';
import { memberBracketPublicSource } from './member-bracket-public-source';

describe('memberBracketPublicSource', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('omits admin credentials and passes the actual schedule cursor', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'success', data: { nextCursor: 'page-3' } }) });
    vi.stubGlobal('fetch', fetcher);
    const result = await memberBracketPublicSource('cup').v1Get('/tournaments/cup/schedule', { cursor: 'page 2' });
    expect(result).toEqual({ nextCursor: 'page-3' });
    expect(fetcher).toHaveBeenCalledWith('/api/v1/tournaments/cup/schedule?cursor=page+2',
      expect.objectContaining({ credentials: 'omit', cache: 'no-store' }));
  });
  it('denies all writes and reads outside the selected public bracket', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const source = memberBracketPublicSource('cup');
    await expect(source.v1Post('/anything', {})).rejects.toThrow('조회 전용');
    await expect(source.v1Get('/me/teams')).rejects.toThrow('조회 전용');
    await expect(source.v1Get('/tournaments/another')).rejects.toThrow('조회 전용');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('surfaces real API errors instead of displaying a successful empty schedule', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ message: '대진표가 비공개예요.' }) }));
    await expect(memberBracketPublicSource('cup').v1Get('/tournaments/cup')).rejects.toThrow('대진표가 비공개예요.');
  });
});
