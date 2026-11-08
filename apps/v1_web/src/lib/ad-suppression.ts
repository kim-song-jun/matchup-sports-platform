import { toKstDateString } from '@/lib/kst-calendar';

/**
 * Per-device memory of which popup campaigns were already shown or dismissed today. The key is the campaign and
 * the placement; the value is the KST calendar date it applies to, so suppression ends at 00:00 KST rather than
 * 24 hours after the dismissal. Closing and "don't show today" are the same action: call `suppressPopupForToday`.
 */
const PLACEMENT = 'popup';
const KEY_PREFIX = `teameet.v1.ad-suppressed.${PLACEMENT}.`;

/** Only filled when localStorage refuses the write; it lives until the page is reloaded and is never synced. */
const sessionMemory = new Map<string, string>();

const keyOf = (campaignId: string) => `${KEY_PREFIX}${campaignId}`;

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Entries from earlier days can never suppress again; dropping them keeps one key per live campaign. */
function removeExpiredEntries(storage: Storage, today: string) {
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (key?.startsWith(KEY_PREFIX) && storage.getItem(key) !== today) storage.removeItem(key);
  }
}

export function isPopupSuppressed(campaignId: string, now: Date = new Date()): boolean {
  const today = toKstDateString(now);
  const key = keyOf(campaignId);
  return readStored(key) === today || sessionMemory.get(key) === today;
}

export function suppressPopupForToday(campaignId: string, now: Date = new Date()): void {
  const today = toKstDateString(now);
  const key = keyOf(campaignId);
  try {
    const storage = window.localStorage;
    storage.setItem(key, today);
    removeExpiredEntries(storage, today);
  } catch {
    sessionMemory.set(key, today);
  }
}
