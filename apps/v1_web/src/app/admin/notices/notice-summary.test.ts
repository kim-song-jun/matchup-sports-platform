import { describe, expect, it } from 'vitest';
import { noticeSummary } from './notice-summary';

describe('noticeSummary', () => {
  it('preserves authored line breaks for the admin notice card preview', () => {
    expect(noticeSummary('첫 줄\n\n둘째 줄\r\n셋째 줄')).toBe('첫 줄\n\n둘째 줄\n셋째 줄');
  });
});
