import { describe, expect, it } from 'vitest';
import { formatChatDate, formatChatListTimestamp, formatChatTime, shouldShowChatDate } from './chat-message-time';

describe('chat message time presentation', () => {
  it('formats every message time to hour and minute in the product timezone', () => {
    expect(formatChatTime('2026-05-18T09:04:00.000Z')).toBe('18:04');
  });

  it('shows a month-and-day divider for the first message and when the date changes', () => {
    expect(formatChatDate('2026-05-17T15:01:00.000Z')).toBe('5월 18일');
    expect(shouldShowChatDate('2026-05-17T14:59:00.000Z')).toBe(true);
    expect(shouldShowChatDate('2026-05-17T15:01:00.000Z', '2026-05-17T14:59:00.000Z')).toBe(true);
    expect(shouldShowChatDate('2026-05-18T03:00:00.000Z', '2026-05-17T15:01:00.000Z')).toBe(false);
  });

  it('does not create misleading metadata for an invalid timestamp', () => {
    expect(formatChatTime('invalid')).toBe('');
    expect(formatChatDate('invalid')).toBe('');
    expect(shouldShowChatDate('invalid')).toBe(false);
  });

  it('shows only the time for chat rooms updated today', () => {
    expect(formatChatListTimestamp('2026-05-18T09:04:00.000Z', new Date('2026-05-18T12:00:00.000Z'))).toBe('18:04');
  });

  it('shows only the date for chat rooms updated before today', () => {
    expect(formatChatListTimestamp('2026-05-17T14:59:00.000Z', new Date('2026-05-18T12:00:00.000Z'))).toBe('5월 17일');
  });
});
