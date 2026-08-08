import { describe, expect, it } from 'vitest';
import { assertQueueable } from '@/lib/game-operations-queue';

describe('reverseEvent must never enter the offline queue', () => {
  it('assertQueueable rejects "reverse_event" the same way it already rejects lifecycle commands', () => {
    expect(() => assertQueueable('reverse_event' as never)).toThrow();
  });
});
