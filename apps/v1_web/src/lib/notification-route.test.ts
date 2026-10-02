import { describe, expect, it } from 'vitest';
import { normalizeNotificationHref } from './notification-route';

describe('normalizeNotificationHref', () => {
  it.each([
    'https://attacker.example/phish',
    '//attacker.example/phish',
    'javascript:alert(1)',
    '/\\attacker.example/phish',
  ])('rejects unsafe notification route %s', (route) => {
    expect(normalizeNotificationHref(route)).toBe('/notifications');
  });

  it('normalizes supported internal routes and keeps navigation on the app origin', () => {
    expect(normalizeNotificationHref('/chat/rooms/room-1', 'chat')).toBe('/chat/room-1?from=%2Fnotifications');
    expect(normalizeNotificationHref('/reviews?status=pending', 'review_received')).toBe(
      '/my/reviews?status=pending&from=%2Fnotifications',
    );
    expect(normalizeNotificationHref('/teams/team-1?from=%2Fnotifications')).toBe(
      '/teams/team-1?from=%2Fnotifications',
    );
  });

  // 기록 동의 딥링크는 이미 from=tournament 를 싣는다 — 키가 두 개가 되면 get('from') 이 앞의 값을 읽어
  // 알림으로 돌아가지 못한다.
  it('딥링크에 from 이 이미 있으면 알림 출처로 바꿔 하나만 남긴다', () => {
    const href = normalizeNotificationHref('/my/settings/record-consent?from=tournament&tournamentId=t1', 'tournament_record_consent_invite');
    const params = new URLSearchParams(href.split('?')[1]);
    expect(params.getAll('from')).toEqual(['/notifications']);
    expect(params.get('tournamentId')).toBe('t1');
  });
});
