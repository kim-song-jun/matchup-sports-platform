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
    expect(normalizeNotificationHref('/chat/rooms/room-1', 'chat')).toBe('/chat/room-1?from=notifications');
    expect(normalizeNotificationHref('/reviews?status=pending', 'review_received')).toBe(
      '/my/reviews?status=pending&from=notifications',
    );
    expect(normalizeNotificationHref('/teams/team-1?from=notifications')).toBe(
      '/teams/team-1?from=notifications',
    );
  });
});
