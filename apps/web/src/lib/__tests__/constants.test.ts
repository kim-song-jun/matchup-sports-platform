import { describe, it, expect } from 'vitest';
import { sportLabel, levelLabel, sportIconColor, matchStatusLabel, lessonTypeLabel } from '../constants';

describe('sportLabel', () => {
  const expectedSports = [
    'soccer', 'futsal', 'basketball', 'badminton', 'ice_hockey',
    'figure_skating', 'short_track', 'swimming', 'tennis', 'baseball', 'volleyball',
  ];

  it('has all 11 sport types defined', () => {
    expect(Object.keys(sportLabel)).toHaveLength(11);
  });

  it.each(expectedSports)('has Korean label for %s', (sport) => {
    expect(sportLabel[sport]).toBeDefined();
    expect(typeof sportLabel[sport]).toBe('string');
    expect(sportLabel[sport].length).toBeGreaterThan(0);
  });

  it('returns correct labels', () => {
    expect(sportLabel.soccer).toBe('축구');
    expect(sportLabel.futsal).toBe('풋살');
    expect(sportLabel.basketball).toBe('농구');
    expect(sportLabel.tennis).toBe('테니스');
  });
});

describe('levelLabel', () => {
  it('has 5 levels (1-5)', () => {
    expect(Object.keys(levelLabel)).toHaveLength(5);
  });

  it('maps levels correctly', () => {
    expect(levelLabel[1]).toBe('입문');
    expect(levelLabel[2]).toBe('초급');
    expect(levelLabel[3]).toBe('중급');
    expect(levelLabel[4]).toBe('상급');
    expect(levelLabel[5]).toBe('고수');
  });
});

describe('sportIconColor', () => {
  it('has color for every sport type', () => {
    const sportTypes = Object.keys(sportLabel);
    sportTypes.forEach((sport) => {
      expect(sportIconColor[sport]).toBeDefined();
      expect(sportIconColor[sport]).toContain('bg-');
      expect(sportIconColor[sport]).toContain('text-');
    });
  });
});

describe('matchStatusLabel', () => {
  it('has all statuses', () => {
    expect(matchStatusLabel.recruiting).toBe('모집중');
    expect(matchStatusLabel.full).toBe('마감');
    expect(matchStatusLabel.completed).toBe('완료');
    expect(matchStatusLabel.cancelled).toBe('취소');
  });
});

describe('lessonTypeLabel', () => {
  it('has all lesson types', () => {
    expect(lessonTypeLabel.group_lesson).toBe('그룹 레슨');
    expect(lessonTypeLabel.practice_match).toBe('연습 경기');
    expect(lessonTypeLabel.free_practice).toBe('자유 연습');
  });
});
