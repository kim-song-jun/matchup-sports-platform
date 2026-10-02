import { absoluteSiteUrl, fetchPublicV1, metadataDescription, NOTICES_FEED_PATH } from '@/lib/seo';
import type { V1Notice, V1NoticesResponse } from '@/types/api';

/**
 * `/notices/feed.xml` — 공지 RSS 2.0. 네이버 서치어드바이저 "RSS 제출"과 Google 사이트맵 양쪽에 쓴다.
 * 공지 API 가 실패하면 빈 피드가 아니라 500 을 낸다 — 빈 피드는 "공지가 모두 사라졌다"로 읽힌다.
 */
// sitemap.ts 와 같은 이유로 빌드 타임 프리렌더를 끈다(API 에 못 닿는 빌드에서 빈 피드가 구워진다).
export const revalidate = 0;

export async function GET(): Promise<Response> {
  const page = await fetchPublicV1<V1NoticesResponse>('/notices');
  // fetchPublicV1 은 404 를 null 로 돌려준다 — 목록 엔드포인트의 404 는 "공지 0건"이 아니라 경로 오류다.
  if (!page) throw new Error('SEO metadata request failed: /notices (404)');
  const items = page.notices.flatMap(renderItem);

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '<channel>',
    '<title>Teameet 공지사항</title>',
    `<link>${escapeXml(absoluteSiteUrl('/notices'))}</link>`,
    '<description>Teameet 서비스 업데이트와 중요한 운영 소식</description>',
    '<language>ko</language>',
    `<atom:link href="${escapeXml(absoluteSiteUrl(NOTICES_FEED_PATH))}" rel="self" type="application/rss+xml"/>`,
    ...items,
    '</channel>',
    '</rss>',
  ].join('\n');

  return new Response(xml, {
    headers: { 'content-type': 'application/rss+xml; charset=utf-8' },
  });
}

function renderItem(notice: V1Notice): string[] {
  const id = notice.noticeId ?? notice.id;
  if (!id) return [];
  const url = absoluteSiteUrl(`/notices/${encodeURIComponent(id)}`);
  const publishedAt = notice.publishedAt ? new Date(notice.publishedAt) : null;

  return [
    [
      '<item>',
      `<title>${escapeXml(notice.title)}</title>`,
      `<link>${escapeXml(url)}</link>`,
      `<guid isPermaLink="true">${escapeXml(url)}</guid>`,
      // RSS 의 description 은 리더가 HTML 로 해석한다 — 평문을 HTML 로 한 번, XML 로 한 번 이스케이프한다.
      `<description>${escapeXml(escapeXml(metadataDescription(notice.body, notice.title)))}</description>`,
      ...(notice.category ? [`<category>${escapeXml(notice.category)}</category>`] : []),
      ...(publishedAt && !Number.isNaN(publishedAt.getTime()) ? [`<pubDate>${publishedAt.toUTCString()}</pubDate>`] : []),
      '</item>',
    ].join(''),
  ];
}

// XML 1.0 은 탭·개행·CR 외의 C0 제어문자를 허용하지 않는다 — 공지 본문에 하나만 섞여도 피드 전체가 파싱 실패한다.
// eslint-disable-next-line no-control-regex
const XML_INVALID_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;

function escapeXml(value: string): string {
  return value
    .replace(XML_INVALID_CHARS, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
