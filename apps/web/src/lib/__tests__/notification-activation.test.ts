import { describe, expect, it } from 'vitest';
import { shouldHandleInAppNotificationNavigation } from '../notification-activation';

function createEvent(overrides: Partial<Parameters<typeof shouldHandleInAppNotificationNavigation>[0]> = {}) {
  return {
    button: 0,
    metaKey: false,
    altKey: false,
    ctrlKey: false,
    shiftKey: false,
    defaultPrevented: false,
    ...overrides,
  };
}

describe('shouldHandleInAppNotificationNavigation', () => {
  it('handles plain left click navigation in app', () => {
    expect(shouldHandleInAppNotificationNavigation(createEvent())).toBe(true);
  });

  it('skips navigation takeover when the event was already prevented', () => {
    expect(shouldHandleInAppNotificationNavigation(createEvent({ defaultPrevented: true }))).toBe(false);
  });

  it('skips navigation takeover for modifier-assisted tab opens', () => {
    expect(shouldHandleInAppNotificationNavigation(createEvent({ metaKey: true }))).toBe(false);
    expect(shouldHandleInAppNotificationNavigation(createEvent({ ctrlKey: true }))).toBe(false);
    expect(shouldHandleInAppNotificationNavigation(createEvent({ shiftKey: true }))).toBe(false);
    expect(shouldHandleInAppNotificationNavigation(createEvent({ altKey: true }))).toBe(false);
  });

  it('skips navigation takeover for non-primary mouse buttons', () => {
    expect(shouldHandleInAppNotificationNavigation(createEvent({ button: 1 }))).toBe(false);
  });
});
