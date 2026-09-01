/**
 * llms.txt 는 AI 크롤러가 사이트를 이해하는 첫 문서다. 여기서 500 이 나면 크롤러에게는
 * "이 사이트엔 llms.txt 가 없다"와 같은 결과가 된다 — 대회 목록 조회가 실패해도
 * 안내서 본문은 반드시 나가야 한다는 것이 이 라우트의 핵심 계약이다.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchPublicV1 = vi.fn();

vi.mock('@/lib/seo', async () => {
  const actual = await vi.importActual<typeof import('@/lib/seo')>('@/lib/seo');
  return { ...actual, fetchPublicV1: (path: string) => fetchPublicV1(path) };
});

const { GET } = await import('./route');

beforeEach(() => {
  fetchPublicV1.mockReset();
});

describe('GET /llms.txt', () => {
  it('모집 중·진행 중 대회만 골라 최신 URL 과 함께 싣는다', async () => {
    fetchPublicV1.mockResolvedValue({
      items: [
        {
          id: 'open-1',
          title: '가을 풋살컵',
          status: 'open',
          sport: { code: 'futsal', name: '풋살' },
          scheduledAt: '2026-10-01T01:00:00.000Z',
          venue: '서울 강남 풋살파크',
        },
        {
          id: 'live-1',
          title: '진행 중 리그',
          status: 'in_progress',
          sport: { code: 'basketball', name: '농구' },
          scheduledAt: null,
          venue: null,
        },
        {
          id: 'done-1',
          title: '끝난 대회',
          status: 'completed',
          sport: { code: 'futsal', name: '풋살' },
          scheduledAt: '2026-01-01T01:00:00.000Z',
          venue: '어딘가',
        },
      ],
      pageInfo: { hasNext: false, nextCursor: null },
    });

    const body = await (await GET()).text();

    expect(body).toContain('https://teameet.co.kr/tournaments/open-1');
    expect(body).toContain('https://teameet.co.kr/tournaments/live-1');
    // 종료된 대회를 "현재 모집 중" 목록에 올리면 AI 가 낡은 대회를 열려 있다고 답한다.
    expect(body).not.toContain('tournaments/done-1');
    // 일정·장소가 없는 대회도 빈 구분자 없이 깔끔하게 나가야 한다.
    expect(body).toContain('- [진행 중 리그](https://teameet.co.kr/tournaments/live-1): 농구\n');
    expect(body).not.toContain('· ·');
  });

  it('대회 목록 조회가 실패해도 200 과 안내서 본문을 낸다', async () => {
    fetchPublicV1.mockRejectedValue(new Error('upstream down'));

    const response = await GET();
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/plain');
    expect(body).toContain('# Teameet');
    expect(body).toContain('https://teameet.co.kr/sitemap.xml');
    // 목록 섹션은 통째로 빠지되 안내서는 살아 있어야 한다.
    expect(body).not.toContain('## 현재 모집 중이거나 진행 중인 대회');
  });
});
