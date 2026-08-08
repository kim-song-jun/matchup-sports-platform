import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QueueStatusPanel } from './queue-status-panel';
import type { QueuedGameEvent } from '@/lib/game-operations-queue';

/**
 * Task 5 (e3dccad2) made FOUL a real `type: 'FOUL'` wire event instead of
 * disguising it as `type: 'CORRECTION', payload: { kind: 'FOUL' }`. This
 * panel's `eventLabel()` used to only key off the CORRECTION discriminator,
 * so a real FOUL item fell through to the raw-type fallback and showed the
 * English string "FOUL" in the queue instead of "파울".
 */

function queuedEvent(overrides: Partial<QueuedGameEvent['event']> = {}): QueuedGameEvent {
  return {
    clientEventId: 'client-1',
    gameId: 'game-1',
    expectedVersion: 1,
    event: {
      type: 'FOUL',
      period: 1,
      clockMs: 0,
      occurredAt: '2026-08-08T00:00:00.000Z',
      payload: {},
      ...overrides,
    },
    payloadHash: 'hash',
    status: 'queued',
    queuedAt: '2026-08-08T00:00:00.000Z',
    attempts: 0,
    lastError: null,
    ackedSequence: null,
    ackedVersion: null,
  };
}

describe('QueueStatusPanel — 이벤트 라벨', () => {
  it('실제 FOUL 이벤트를 "파울"로 표시한다 (영문 원문 노출 금지)', () => {
    render(<QueueStatusPanel items={[queuedEvent()]} onRetry={vi.fn()} />);

    expect(screen.getByText('파울')).toBeInTheDocument();
    expect(screen.queryByText('FOUL')).toBeNull();
  });
});
