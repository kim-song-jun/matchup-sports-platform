import { describe, expect, it } from 'vitest';
import {
  collectEventTimeCorrections,
  correctionCtaLabel,
  correctionRangeError,
  correctionRangeHint,
  eventClockUpperBoundMs,
  eventTimeCorrectionErrorMessage,
  isClockInRange,
  parseTypedClock,
} from './event-time-correction';
import type { GameEventRecord } from '@/types/game-operations';

const MIN = 60_000;

function row(overrides: Partial<GameEventRecord> & Pick<GameEventRecord, 'id' | 'type' | 'sequence'>): GameEventRecord {
  return {
    gameId: 'game-1',
    clientEventId: `c-${overrides.sequence}`,
    payloadHash: 'h',
    sideId: null,
    participantId: null,
    assistParticipantId: null,
    period: 1,
    clockMs: 0,
    occurredAt: '2026-11-10T03:00:00.000Z',
    receivedAt: '2026-11-10T03:00:00.000Z',
    actorUserId: 'u-1',
    reversesEventId: null,
    correctsEventId: null,
    payload: {},
    ...overrides,
  };
}

describe('collectEventTimeCorrections', () => {
  it('첫 정정의 이전 시각이 "처음 기록"이고 마지막 정정이 현재 시각이다', () => {
    const events = [
      row({ id: 'card-1', type: 'CARD', sequence: 1, clockMs: 11 * MIN }),
      row({
        id: 'tc-2', type: 'TIME_CORRECTION', sequence: 4, clockMs: 8 * MIN, correctsEventId: 'card-1',
        payload: { previousClockMs: 9 * MIN, clockMs: 8 * MIN, lane: 'PLATFORM_ADMIN', reason: '대조' },
        receivedAt: '2026-11-10T04:00:00.000Z',
      }),
      row({
        id: 'tc-1', type: 'TIME_CORRECTION', sequence: 3, clockMs: 9 * MIN, correctsEventId: 'card-1',
        payload: { previousClockMs: 11 * MIN, clockMs: 9 * MIN, lane: 'OPERATOR', reason: '자동' },
      }),
    ];

    const info = collectEventTimeCorrections(events).get('card-1');
    expect(info?.originalClockMs).toBe(11 * MIN);
    expect(info?.currentClockMs).toBe(8 * MIN);
    expect(info?.steps.map((step) => step.lane)).toEqual(['OPERATOR', 'PLATFORM_ADMIN']);
    expect(collectEventTimeCorrections(events).has('tc-1')).toBe(false);
  });

  it('정정 행이 없으면 비어 있다', () => {
    expect(collectEventTimeCorrections([row({ id: 'g', type: 'GOAL', sequence: 1 })]).size).toBe(0);
  });
});

describe('eventClockUpperBoundMs', () => {
  const started = '2026-11-10T03:00:00.000Z';
  it('설정 길이와 실제로 흐른 시간(일시정지 제외) 중 큰 값이다', () => {
    const base = { startedAt: started, endedAt: '2026-11-10T03:25:00.000Z', pausedTotalMs: 2 * MIN + 30_000, pausedAt: null };
    expect(eventClockUpperBoundMs({ configuredMinutes: 20, period: base, nowMs: Date.parse(started) })).toBe(22 * MIN + 30_000);
    expect(eventClockUpperBoundMs({ configuredMinutes: 30, period: base, nowMs: 0 })).toBe(30 * MIN);
  });
  it('둘 다 모르면 null, 한쪽만 알면 그 값이다', () => {
    expect(eventClockUpperBoundMs({ configuredMinutes: null, period: null, nowMs: 0 })).toBeNull();
    expect(eventClockUpperBoundMs({ configuredMinutes: 20, period: null, nowMs: 0 })).toBe(20 * MIN);
  });
  it('진행 중인 피리어드는 지금까지 흐른 시간에서 열린 일시정지를 뺀다', () => {
    const now = Date.parse(started) + 25 * MIN;
    const period = { startedAt: started, endedAt: null, pausedTotalMs: 0, pausedAt: new Date(now - 3 * MIN).toISOString() };
    expect(eventClockUpperBoundMs({ configuredMinutes: 20, period, nowMs: now })).toBe(22 * MIN);
  });
});

describe('parseTypedClock', () => {
  it.each([
    ['9', 9 * MIN],
    ['12', 12 * MIN],
    ['930', 9 * MIN + 30_000],
    ['1130', 11 * MIN + 30_000],
    ['0900', 9 * MIN],
    ['9:30', 9 * MIN + 30_000],
  ])('%s -> %i', (raw, expected) => {
    expect(parseTypedClock(raw)).toBe(expected);
  });
  it.each(['', 'abc', '975', '1234567'])('%s 는 받지 않는다', (raw) => {
    expect(parseTypedClock(raw)).toBeNull();
  });
});

describe('copy', () => {
  it('CTA 는 받침에 따라 로/으로를 고른다', () => {
    expect(correctionCtaLabel(11 * MIN, 9 * MIN)).toBe('11:00 → 9:00으로 정정');
    expect(correctionCtaLabel(11 * MIN, 9 * MIN + 10_000)).toBe('11:00 → 9:10으로 정정');
    expect(correctionCtaLabel(11 * MIN, 9 * MIN + 30_000)).toBe('11:00 → 9:30으로 정정');
    expect(correctionCtaLabel(11 * MIN, 9 * MIN + 31_000)).toBe('11:00 → 9:31로 정정');
    expect(correctionCtaLabel(11 * MIN, 9 * MIN + 32_000)).toBe('11:00 → 9:32로 정정');
  });
  it('범위 안내와 오류 문장', () => {
    expect(correctionRangeHint('전반', 22 * MIN + 30_000)).toBe('전반 0:00–22:30 사이에서 고를 수 있어요. 전·후반은 바꿀 수 없어요.');
    expect(correctionRangeError('후반', 20 * MIN)).toBe('후반 0:00–20:00 밖이에요. 범위 안으로 맞춰 주세요.');
    expect(isClockInRange(20 * MIN, 20 * MIN)).toBe(true);
    expect(isClockInRange(20 * MIN + 1, 20 * MIN)).toBe(false);
    expect(isClockInRange(5, null)).toBe(true);
  });
  it('서버 에러 코드를 해요체 안내로 바꾼다', () => {
    const err = Object.assign(new Error('raw'), { code: 'RESULT_ALREADY_OFFICIAL' });
    expect(eventTimeCorrectionErrorMessage(err)).toContain('결과가 이미 확정');
    expect(eventTimeCorrectionErrorMessage(new Error('boom'))).toBe('boom');
    expect(eventTimeCorrectionErrorMessage(null)).toBe('시각을 정정하지 못했어요. 잠시 후 다시 시도해 주세요.');
  });
});
