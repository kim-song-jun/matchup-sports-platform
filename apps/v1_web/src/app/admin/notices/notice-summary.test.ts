import { describe, expect, it } from 'vitest';
import { noticeSummary } from './notice-summary';

describe('noticeSummary', () => {
  it('preserves authored line breaks for the admin notice card preview', () => {
    expect(noticeSummary('첫 줄\n\n둘째 줄\r\n셋째 줄')).toBe('첫 줄\n\n둘째 줄\n셋째 줄');
  });

  it('removes all uploaded image file names from mixed content', () => {
    expect(
      noticeSummary('안내 문구\n[이미지: first.png]\n[이미지: second.webp]\n마무리 문구'),
    ).toBe('안내 문구\n마무리 문구');
  });

  it('uses a readable label instead of a file name for image-only content', () => {
    expect(noticeSummary('[이미지: event-poster.png]')).toBe('이미지가 포함된 공지입니다.');
  });
});
