/**
 * 공지 RSS 는 운영자가 쓴 제목·본문을 그대로 싣는다 — 이스케이프가 한 글자라도 새면
 * 피드 전체가 XML 파싱 실패로 버려진다(네이버·구글 모두 해당 피드를 통째로 무시한다).
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

describe('GET /notices/feed.xml', () => {
  it('공지 제목·본문의 XML 특수문자와 제어문자를 이스케이프해 파싱 가능한 RSS 로 낸다', async () => {
    fetchPublicV1.mockResolvedValue({
      notices: [
        {
          noticeId: 'n-1',
          category: '안내',
          title: '<b>점검</b> & "공지" \'1차\'',
          body: '12일 02:00~04:00 점검\u0007 <script>alert(1)</script>',
          publishedAt: '2026-09-20T01:00:00.000Z',
        },
        { noticeId: 'n-2', title: '날짜 없는 공지', body: '', publishedAt: null },
      ],
    });

    const response = await GET();
    const xml = await response.text();

    expect(fetchPublicV1).toHaveBeenCalledWith('/notices');
    expect(response.headers.get('content-type')).toBe('application/rss+xml; charset=utf-8');
    expect(xml).not.toContain('<b>');
    expect(xml).not.toContain('<script>');
    expect(xml).not.toContain('\u0007');

    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
    const items = [...doc.getElementsByTagName('item')];
    expect(items).toHaveLength(2);
    expect(items[0].getElementsByTagName('title')[0].textContent).toBe('<b>점검</b> & "공지" \'1차\'');
    expect(items[0].getElementsByTagName('link')[0].textContent).toBe('https://teameet.co.kr/notices/n-1');
    expect(items[0].getElementsByTagName('pubDate')[0].textContent).toBe('Sun, 20 Sep 2026 01:00:00 GMT');
    // 리더는 description 을 HTML 로 렌더한다 — 본문 속 태그가 마크업이 아니라 글자로 보여야 한다.
    const descriptionHtml = new DOMParser().parseFromString(
      items[0].getElementsByTagName('description')[0].textContent ?? '',
      'text/html',
    );
    expect(descriptionHtml.querySelector('script')).toBeNull();
    expect(descriptionHtml.body.textContent).toBe('12일 02:00~04:00 점검 <script>alert(1)</script>');
    // 본문이 비면 설명은 제목으로 채우고, 발행일이 없으면 pubDate 를 지어내지 않는다.
    expect(items[1].getElementsByTagName('description')[0].textContent).toBe('날짜 없는 공지');
    expect(items[1].getElementsByTagName('pubDate')).toHaveLength(0);
  });

  it('공지 API 가 실패하면 빈 피드 대신 오류로 끝난다', async () => {
    fetchPublicV1.mockRejectedValue(new Error('SEO metadata request failed: /notices (503)'));
    await expect(GET()).rejects.toThrow('/notices (503)');
  });

  it('목록 API 가 404(null)면 빈 피드가 아니라 오류로 끝난다', async () => {
    fetchPublicV1.mockResolvedValue(null);
    await expect(GET()).rejects.toThrow('/notices (404)');
  });
});
