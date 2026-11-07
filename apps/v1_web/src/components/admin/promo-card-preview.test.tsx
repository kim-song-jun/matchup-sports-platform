import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PromoHomePreview, PromoListPreview, type PromoPreviewFallback, type PromoPreviewFields } from './promo-card-preview';

const fields: PromoPreviewFields = {
  title: '', subtitle: '', badgeText: '', imageUrl: '/uploads/2026/11/promo.webp',
  dateText: '', teamsText: '', locationText: '', prizeText: '',
};
const fallback: PromoPreviewFallback = { title: '대회', venue: null, sportName: null };

// jsdom 은 `background: url() center/cover` 단축 속성을 통째로 버려서, 서버 렌더 마크업의 style 문자열로 확인한다.
function backgroundUrls(markup: string) {
  return Array.from(markup.matchAll(/url\(&quot;([^&]+(?:&amp;[^&]+)*?)&quot;\)/g)).map(
    (match) => new URL(match[1].replaceAll('&amp;', '&'), 'http://localhost'),
  );
}

describe('홍보 카드 미리보기 배경 이미지', () => {
  it('홈 카드 미리보기는 원본이 아니라 최적화기를 거친 폭으로 받는다', () => {
    const [url] = backgroundUrls(renderToStaticMarkup(<PromoHomePreview fields={fields} fallback={fallback} />));
    expect(url.pathname).toBe('/_next/image');
    expect(url.searchParams.get('url')).toBe('/uploads/2026/11/promo.webp');
    // 미리보기 카드는 폼 폭만큼 넓게 그려진다 — 썸네일 폭으로 받으면 흐려진다.
    expect(Number(url.searchParams.get('w'))).toBeGreaterThanOrEqual(1080);
  });

  it('목록 배너 미리보기도 같은 경로로 받는다', () => {
    const [url] = backgroundUrls(renderToStaticMarkup(<PromoListPreview fields={fields} fallback={fallback} />));
    expect(url.pathname).toBe('/_next/image');
    expect(url.searchParams.get('url')).toBe('/uploads/2026/11/promo.webp');
  });

  it('외부 이미지 URL 은 그대로 배경에 둔다', () => {
    const [url] = backgroundUrls(
      renderToStaticMarkup(<PromoHomePreview fields={{ ...fields, imageUrl: 'https://images.example.com/p.webp' }} fallback={fallback} />),
    );
    expect(url.href).toBe('https://images.example.com/p.webp');
  });
});
