import { describe, expect, it } from 'vitest';
import { v1Keys } from '@/lib/query-keys';

describe('v1Keys.gameOperationsLineup', () => {
  it('is scoped under the game key so game-scoped invalidation clears it too', () => {
    expect(v1Keys.gameOperationsLineup('game-1')).toEqual([...v1Keys.game('game-1'), 'operations-lineup']);
  });
});
