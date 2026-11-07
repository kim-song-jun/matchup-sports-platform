import { describe, expect, it } from 'vitest';
import { isPastEntry, isUpcomingEntry, nextUpcomingFixtureId } from './schedule-upcoming';
import type { PublicScheduleEntry } from './types';

function entry(overrides: Partial<PublicScheduleEntry>): PublicScheduleEntry {
  return {
    fixtureId: 'f', round: 'group', fixtureNumber: 1, legNumber: 1, groupId: null, groupName: 'A조',
    scheduledAt: '2026-08-01T10:00:00.000Z', venue: null, fieldId: null, fieldName: null,
    home: null, away: null, homeSlotLabel: null, awaySlotLabel: null,
    visibilityMode: 'live', status: 'scheduled', resultState: 'pending', scoreStatus: 'unavailable', score: null,
    clock: null, periodBreak: null, scorers: [], cards: [], outcome: null, hasVideo: false,
    ...overrides,
  };
}

describe('예정·지난 경기 판정', () => {
  it('scheduled 만 예정이고 진행 중은 예정도 지난 경기도 아니다', () => {
    expect(isUpcomingEntry({ status: 'scheduled' })).toBe(true);
    expect([isUpcomingEntry({ status: 'live' }), isPastEntry({ status: 'live' })]).toEqual([false, false]);
    expect([isPastEntry({ status: 'ended' }), isPastEntry({ status: 'cancelled' }), isPastEntry({ status: 'scheduled' })]).toEqual([true, true, false]);
  });
});

describe('nextUpcomingFixtureId', () => {
  it('조 순서가 아니라 시각이 가장 이른 예정 경기를 고른다 — 뒤 조의 더 이른 경기가 이긴다', () => {
    const next = nextUpcomingFixtureId([
      entry({ fixtureId: 'a-late', groupName: 'A조', fixtureNumber: 1, scheduledAt: '2026-08-01T14:00:00.000Z' }),
      entry({ fixtureId: 'b-early', groupName: 'B조', fixtureNumber: 2, scheduledAt: '2026-08-01T13:00:00.000Z' }),
    ]);
    expect(next).toBe('b-early');
  });

  it('끝난 경기와 진행 중 경기는 건너뛴다', () => {
    const next = nextUpcomingFixtureId([
      entry({ fixtureId: 'done', status: 'ended', scheduledAt: '2026-08-01T08:00:00.000Z' }),
      entry({ fixtureId: 'live', status: 'live', scheduledAt: '2026-08-01T09:00:00.000Z' }),
      entry({ fixtureId: 'cancelled', status: 'cancelled', scheduledAt: '2026-08-01T09:30:00.000Z' }),
      entry({ fixtureId: 'next', scheduledAt: '2026-08-01T12:00:00.000Z' }),
    ]);
    expect(next).toBe('next');
  });

  it('시각이 같으면 화면에 그려지는 순서(조 이름순, 경기 번호순)에서 앞선 경기다', () => {
    const next = nextUpcomingFixtureId([
      entry({ fixtureId: 'b', groupName: 'B조', fixtureNumber: 1 }),
      entry({ fixtureId: 'a2', groupName: 'A조', fixtureNumber: 3 }),
      entry({ fixtureId: 'a1', groupName: 'A조', fixtureNumber: 2 }),
    ]);
    expect(next).toBe('a1');
  });

  it('시각이 있는 예정 경기가 시각 미정 경기보다 앞선다', () => {
    const next = nextUpcomingFixtureId([
      entry({ fixtureId: 'tbd', groupName: 'A조', fixtureNumber: 1, scheduledAt: null }),
      entry({ fixtureId: 'timed', groupName: 'B조', fixtureNumber: 2, scheduledAt: '2026-08-01T15:00:00.000Z' }),
    ]);
    expect(next).toBe('timed');
  });

  it('모두 시각 미정이면 화면 순서상 첫 예정 경기를 고른다', () => {
    const next = nextUpcomingFixtureId([
      entry({ fixtureId: 'final', round: 'final', groupName: null, fixtureNumber: 1, scheduledAt: null }),
      entry({ fixtureId: 'group', fixtureNumber: 2, scheduledAt: null }),
    ]);
    expect(next).toBe('group');
  });

  it('예정 경기가 없으면 null 이다', () => {
    expect(nextUpcomingFixtureId([entry({ status: 'ended' })])).toBeNull();
    expect(nextUpcomingFixtureId([])).toBeNull();
  });
});
