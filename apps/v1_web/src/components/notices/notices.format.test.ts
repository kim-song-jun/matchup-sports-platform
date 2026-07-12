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
});
