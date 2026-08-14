import { describe, expect, it } from 'vitest';
import { isPenaltyShootoutDecisive, nextPenaltyKicker, penaltyScoreBySideId, type PenaltyKick } from './penalty-shootout';

const HOME = 'side-home';
const AWAY = 'side-away';
const SIDES = [{ id: HOME }, { id: AWAY }];

describe('nextPenaltyKicker', () => {
  it('아직 킥이 없으면 sides[0](홈)이 먼저 찬다', () => {
    expect(nextPenaltyKicker([], SIDES)).toBe(HOME);
  });

  it('두 팀이 번갈아 찬다', () => {
    const kicks: PenaltyKick[] = [{ sideId: HOME, result: 'SCORED' }];
    expect(nextPenaltyKicker(kicks, SIDES)).toBe(AWAY);
    expect(
      nextPenaltyKicker([...kicks, { sideId: AWAY, result: 'MISSED' }], SIDES),
    ).toBe(HOME);
  });

  it('사이드가 없으면 null', () => {
    expect(nextPenaltyKicker([], [])).toBeNull();
  });
});

describe('penaltyScoreBySideId', () => {
  it('성공(SCORED) 킥만 사이드별로 센다', () => {
    const kicks: PenaltyKick[] = [
      { sideId: HOME, result: 'SCORED' },
      { sideId: AWAY, result: 'MISSED' },
      { sideId: HOME, result: 'SCORED' },
      { sideId: AWAY, result: 'SCORED' },
    ];
    const score = penaltyScoreBySideId(kicks);
    expect(score.get(HOME)).toBe(2);
    expect(score.get(AWAY)).toBe(1);
  });

  it('킥이 없으면 빈 맵이다(호출부는 ?? 0으로 읽는다)', () => {
    expect(penaltyScoreBySideId([]).size).toBe(0);
  });
});

describe('isPenaltyShootoutDecisive', () => {
  it('점수가 다르면 결판났다고 판단한다', () => {
    expect(isPenaltyShootoutDecisive(3, 2)).toBe(true);
  });

  it('점수가 같으면(무승부) 결판나지 않았다 — 백엔드 extractEndPenalties와 같은 기준', () => {
    expect(isPenaltyShootoutDecisive(2, 2)).toBe(false);
    expect(isPenaltyShootoutDecisive(0, 0)).toBe(false);
  });
});
