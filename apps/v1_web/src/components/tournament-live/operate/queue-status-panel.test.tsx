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

/**
 * 재시도로 풀리지 않는 코드(권한 없음 등)에서 "다시 시도" 버튼을 살려 두면
 * 운영자가 실패 루프에 갇힌다 — `isRetryableGameOperationsErrorCode`의 판정을
 * 그대로 따라야 한다는 계약을 UI 레벨에서 검증한다.
 */
describe('QueueStatusPanel — 재시도 버튼 게이팅', () => {
  it('재시도로 풀리는 코드(VERSION_CONFLICT)에서는 "다시 시도" 버튼을 보여준다', () => {
    const failed: QueuedGameEvent = {
      ...queuedEvent(),
      status: 'failed',
      lastError: { code: 'VERSION_CONFLICT', message: '경기 상태가 변경되어 다시 시도해주세요.' },
    };
    render(<QueueStatusPanel items={[failed]} onRetry={vi.fn()} />);
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument();
  });

  it('재시도로 풀리지 않는 코드(STAFF_SCOPE_DENIED)에서는 "다시 시도" 버튼을 숨긴다', () => {
    const failed: QueuedGameEvent = {
      ...queuedEvent(),
      status: 'failed',
      lastError: { code: 'STAFF_SCOPE_DENIED', message: '이 경기를 운영할 권한이 없어요.' },
    };
    render(<QueueStatusPanel items={[failed]} onRetry={vi.fn()} />);
    expect(screen.queryByRole('button', { name: '다시 시도' })).toBeNull();
    // 버튼 대신 무엇을 해야 하는지 안내하는 문구는 그대로 보인다.
    expect(screen.getByText('이 경기를 운영할 권한이 없어요.')).toBeInTheDocument();
  });
});
