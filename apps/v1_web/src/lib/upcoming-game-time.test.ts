import { describe, expect, it } from 'vitest';
import { describeUpcomingGameTime } from './upcoming-game-time';

describe('describeUpcomingGameTime', () => {
  it('같은 KST 날의 경기는 "오늘" 이고 한 시간 이내면 분 단위로 센다', () => {
    // 2026-09-30 00:10 KST 에 01:10 KST 경기.
    const result = describeUpcomingGameTime('2026-09-29T16:10:00.000Z', new Date('2026-09-29T15:10:00.000Z'));
    expect(result).toEqual({ when: '오늘 01:10', countdown: '1시간 뒤' });
    expect(describeUpcomingGameTime('2026-09-29T16:10:00.000Z', new Date('2026-09-29T15:30:00.000Z'))?.countdown).toBe('40분 뒤');
  });

  it('자정을 넘긴 새벽 경기를 "내일" 이라고 하지 않고 날짜·시각으로 적는다', () => {
    // 지금은 9/29 (화) 22:00 KST, 경기는 9/30 (수) 01:10 KST.
    const result = describeUpcomingGameTime('2026-09-29T16:10:00.000Z', new Date('2026-09-29T13:00:00.000Z'));
    expect(result?.when).toBe('9/30 (수) 01:10');
    expect(result?.when).not.toMatch(/오늘|내일/);
    expect(result?.countdown).toBe('3시간 뒤');
  });

  it('하루 넘게 남은 경기는 카운트다운 없이 날짜·시각만 준다', () => {
    const result = describeUpcomingGameTime('2026-10-03T10:00:00.000Z', new Date('2026-09-29T15:10:00.000Z'));
    expect(result).toEqual({ when: '10/3 (토) 19:00', countdown: null });
  });

  it('시작 시각이 지났거나 시각이 잘못됐으면 카운트다운을 만들지 않는다', () => {
    expect(describeUpcomingGameTime('2026-09-29T14:00:00.000Z', new Date('2026-09-29T15:10:00.000Z'))?.countdown).toBeNull();
    expect(describeUpcomingGameTime('not-a-date', new Date())).toBeNull();
  });
});
