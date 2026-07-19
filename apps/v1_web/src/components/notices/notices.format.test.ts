import { describe, expect, it } from 'vitest';
import { splitNoticeBody, toNotice } from './notices.format';

describe('notice body formatting', () => {
  it('splits LF and CRLF line breaks into visible notice paragraphs', () => {
    expect(splitNoticeBody('첫 줄\n둘째 줄\r\n셋째 줄')).toEqual(['첫 줄', '둘째 줄', '셋째 줄']);
  });

  it('keeps admin-authored line breaks when converting API notices', () => {
    const notice = toNotice({
      id: 'notice-1',
      title: '개행 공지',
      category: '안내',
      publishedAt: '2026-07-08T00:00:00.000Z',
      body: '첫 줄\n둘째 줄',
    });

    expect(notice.summary).toBe('첫 줄\n둘째 줄');
    expect(notice.body).toEqual(['첫 줄', '둘째 줄']);
  });

  it('hides uploaded image file names from the public notice summary', () => {
    const notice = toNotice({
      id: 'notice-image',
      title: '이미지 공지',
      category: '안내',
      publishedAt: '2026-07-19T00:00:00.000Z',
      body: '첫 문장\n[이미지: summer-event-banner.png]\n마지막 문장',
      content: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: '첫 문장' }] },
          {
            type: 'image',
            attrs: {
              assetId: '11111111-1111-4111-8111-111111111111',
              src: '/uploads/2026/07/11111111-1111-4111-8111-111111111111.png',
              alt: 'summer-event-banner.png',
            },
          },
          { type: 'paragraph', content: [{ type: 'text', text: '마지막 문장' }] },
        ],
      },
    });

    expect(notice.summary).toBe('첫 문장\n마지막 문장');
    expect(notice.summary).not.toContain('summer-event-banner.png');
  });

  it('uses a readable summary for an image-only public notice', () => {
    const notice = toNotice({
      id: 'notice-image-only',
      title: '이미지 공지',
      category: '안내',
      publishedAt: '2026-07-19T00:00:00.000Z',
      body: '[이미지: event-poster.webp]',
      content: {
        type: 'doc',
        content: [{
          type: 'image',
          attrs: {
            assetId: '11111111-1111-4111-8111-111111111111',
            src: '/uploads/2026/07/11111111-1111-4111-8111-111111111111.webp',
            alt: 'event-poster.webp',
          },
        }],
      },
    });

    expect(notice.summary).toBe('이미지가 포함된 공지예요.');
  });
});
