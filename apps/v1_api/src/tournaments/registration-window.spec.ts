import { isRegistrationWindowOpen } from './registration-window';

const NOW = Date.parse('2026-10-27T03:00:00.000Z');

describe('isRegistrationWindowOpen — 대회와 정규 리그가 같은 신청 규칙', () => {
  it('접수 중(open)이고 마감 시각이 없으면 받는다', () => {
    expect(isRegistrationWindowOpen('open', null, NOW)).toBe(true);
  });

  it('마감 시각과 같은 순간까지 받고, 지나면 닫는다', () => {
    expect(isRegistrationWindowOpen('open', new Date(NOW), NOW)).toBe(true);
    expect(isRegistrationWindowOpen('open', new Date(NOW - 1), NOW)).toBe(false);
  });

  // 예전 리그 규칙은 마감 시각만 봐서 진행 중·보류 리그도 받았다(MD-QA #183).
  it.each(['draft', 'closed', 'in_progress', 'on_hold', 'completed', 'cancelled'])(
    '%s 상태는 마감이 남아 있어도 받지 않는다',
    (status) => {
      expect(isRegistrationWindowOpen(status, new Date(NOW + 60_000), NOW)).toBe(false);
      expect(isRegistrationWindowOpen(status, null, NOW)).toBe(false);
    },
  );
});
