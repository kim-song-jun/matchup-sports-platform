import { describe, it, expect } from 'vitest';
import {
  sportLabel,
  levelLabel,
  sportCardAccent,
  ticketTypeLabel,
} from '../constants';

// ── sportLabel ───────────────────────────────────────────────────────────────

const ALL_SPORTS = [
  'soccer',
  'futsal',
  'basketball',
  'badminton',
  'ice_hockey',
  'figure_skating',
  'short_track',
  'swimming',
  'tennis',
  'baseball',
  'volleyball',
];

describe('sportLabel', () => {
  it('defines exactly 11 sports', () => {
    expect(Object.keys(sportLabel)).toHaveLength(11);
  });

  it.each(ALL_SPORTS)('has a non-empty Korean label for "%s"', (sport) => {
    expect(sportLabel[sport]).toBeDefined();
    expect(typeof sportLabel[sport]).toBe('string');
    expect(sportLabel[sport].length).toBeGreaterThan(0);
  });

  it('maps well-known keys to correct Korean strings', () => {
    expect(sportLabel.soccer).toBe('축구');
    expect(sportLabel.futsal).toBe('풋살');
    expect(sportLabel.basketball).toBe('농구');
    expect(sportLabel.badminton).toBe('배드민턴');
    expect(sportLabel.ice_hockey).toBe('아이스하키');
    expect(sportLabel.figure_skating).toBe('피겨');
    expect(sportLabel.short_track).toBe('쇼트트랙');
    expect(sportLabel.swimming).toBe('수영');
    expect(sportLabel.tennis).toBe('테니스');
    expect(sportLabel.baseball).toBe('야구');
    expect(sportLabel.volleyball).toBe('배구');
  });
});

// ── levelLabel ───────────────────────────────────────────────────────────────

describe('levelLabel', () => {
  it('defines exactly 5 levels', () => {
    expect(Object.keys(levelLabel)).toHaveLength(5);
  });

  it('covers levels 1 through 5', () => {
    [1, 2, 3, 4, 5].forEach((level) => {
      expect(levelLabel[level]).toBeDefined();
      expect(levelLabel[level].length).toBeGreaterThan(0);
    });
  });

  it('maps each level to the correct Korean label', () => {
    expect(levelLabel[1]).toBe('입문');
    expect(levelLabel[2]).toBe('초급');
    expect(levelLabel[3]).toBe('중급');
    expect(levelLabel[4]).toBe('상급');
    expect(levelLabel[5]).toBe('고수');
  });
});

// ── sportCardAccent ──────────────────────────────────────────────────────────

describe('sportCardAccent', () => {
  it('defines an entry for all 11 sports', () => {
    expect(Object.keys(sportCardAccent)).toHaveLength(11);
  });

  it.each(ALL_SPORTS)('has tint, badge, and dot for "%s"', (sport) => {
    const accent = sportCardAccent[sport];
    expect(accent).toBeDefined();
    expect(typeof accent.tint).toBe('string');
    expect(typeof accent.badge).toBe('string');
    expect(typeof accent.dot).toBe('string');
    expect(accent.tint.length).toBeGreaterThan(0);
    expect(accent.badge.length).toBeGreaterThan(0);
    expect(accent.dot.length).toBeGreaterThan(0);
  });

  it('tint values contain a bg- utility class', () => {
    ALL_SPORTS.forEach((sport) => {
      expect(sportCardAccent[sport].tint).toContain('bg-');
    });
  });

  it('badge values contain both bg- and text- utility classes', () => {
    ALL_SPORTS.forEach((sport) => {
      expect(sportCardAccent[sport].badge).toContain('bg-');
      expect(sportCardAccent[sport].badge).toContain('text-');
    });
  });

  it('dot values contain a bg- utility class', () => {
    ALL_SPORTS.forEach((sport) => {
      expect(sportCardAccent[sport].dot).toContain('bg-');
    });
  });

  it('soccer accent uses green color scheme', () => {
    expect(sportCardAccent.soccer.tint).toContain('green');
    expect(sportCardAccent.soccer.badge).toContain('green');
    expect(sportCardAccent.soccer.dot).toContain('green');
  });

  it('basketball accent uses amber color scheme', () => {
    expect(sportCardAccent.basketball.tint).toContain('amber');
    expect(sportCardAccent.basketball.badge).toContain('amber');
    expect(sportCardAccent.basketball.dot).toContain('amber');
  });
});

// ── ticketTypeLabel ──────────────────────────────────────────────────────────

describe('ticketTypeLabel', () => {
  it('defines exactly 3 ticket types', () => {
    expect(Object.keys(ticketTypeLabel)).toHaveLength(3);
  });

  it('maps single to "1일 체험"', () => {
    expect(ticketTypeLabel.single).toBe('1일 체험');
  });

  it('maps multi to "정기수강"', () => {
    expect(ticketTypeLabel.multi).toBe('정기수강');
  });

  it('maps unlimited to "무제한"', () => {
    expect(ticketTypeLabel.unlimited).toBe('무제한');
  });
});
