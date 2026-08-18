import { UnprocessableEntityException } from '@nestjs/common';
import { assertPenaltyShootoutConcluded, penaltyShootoutDecided } from './penalty-shootout-outcome';

const A2 = { earlyStop: true } as const;
const A1 = { earlyStop: false } as const;

describe('penaltyShootoutDecided — 서버가 킥 수를 보고 판정한다', () => {
  it('한 팀이 한 번도 안 찼으면 점수가 갈려 있어도 미결이다', () => {
    // 총점만 보던 예전 서버는 `1 !== 0`이라 이걸 통과시켰다 — 프런트 가드를
    // 건너뛰고 API 를 직접 때리면 그대로 저장됐다는 뜻이다.
    expect(
      penaltyShootoutDecided({ home: 1, away: 0, takenHome: 1, takenAway: 0, firstKickSideKey: 'HOME' }, A2),
    ).toBe(false);
  });

  it('각 1킥 1:0은 A2에서 미결(잔여 4킥으로 역전 가능)이고 A1에서는 결판이다', () => {
    const counts = { home: 1, away: 0, takenHome: 1, takenAway: 1, firstKickSideKey: 'HOME' } as const;
    expect(penaltyShootoutDecided(counts, A2)).toBe(false);
    expect(penaltyShootoutDecided(counts, A1)).toBe(true);
  });

  it('선축 4킥 4점 / 후축 3킥 0점은 A2에서 결판, A1에서는 미결 — 두 정책이 갈리는 지점', () => {
    const counts = { home: 4, away: 0, takenHome: 4, takenAway: 3, firstKickSideKey: 'HOME' } as const;
    expect(penaltyShootoutDecided(counts, A2)).toBe(true);
    expect(penaltyShootoutDecided(counts, A1)).toBe(false);
  });

  it('선축이 원정일 때 잔여 킥을 원정 기준으로 센다 — 홈으로 굳으면 답이 갈린다', () => {
    // 원정 선축 4킥 4점 / 홈 3킥 0점. 선축을 홈으로 착각하면 "선축 3킥 0점 /
    // 후축 4킥 4점"으로 읽혀 잔여 계산이 뒤집힌다.
    expect(
      penaltyShootoutDecided({ home: 0, away: 4, takenHome: 3, takenAway: 4, firstKickSideKey: 'AWAY' }, A2),
    ).toBe(true);
  });

  it('선축을 모르면 같은 횟수를 찬 경우에만 결판으로 본다 — 홈으로 가정하지 않는다', () => {
    // 선축 하드코딩이 이 기능이 고친 바로 그 결함이라, 레거시에서도 되살리지 않는다.
    expect(penaltyShootoutDecided({ home: 4, away: 0, takenHome: 4, takenAway: 3 }, A2)).toBe(false);
    expect(penaltyShootoutDecided({ home: 3, away: 0, takenHome: 3, takenAway: 3 }, A2)).toBe(true);
  });

  it('서든데스는 같은 횟수를 찬 뒤 점수가 갈려야 결판이다', () => {
    const six = { home: 1, away: 0, takenHome: 6, takenAway: 5, firstKickSideKey: 'HOME' } as const;
    expect(penaltyShootoutDecided(six, A2)).toBe(false);
    expect(
      penaltyShootoutDecided({ home: 1, away: 0, takenHome: 6, takenAway: 6, firstKickSideKey: 'HOME' }, A2),
    ).toBe(true);
  });
});

describe('assertPenaltyShootoutConcluded — 저장 게이트', () => {
  it('킥 수가 없으면 통과시킨다 — 레거시 리비전 정정을 막지 않는다', () => {
    expect(() => assertPenaltyShootoutConcluded({ home: 1, away: 0 }, A2)).not.toThrow();
  });

  it('킥 수가 있고 규칙상 미결이면 422 TOURNAMENT_PENALTY_UNDECIDED 로 막는다', () => {
    // 이게 "프런트 단독 가드"를 없애는 핵심이다 — 화면을 거치지 않고 API 를 직접
    // 호출해도 같은 판정을 받는다.
    expect(() =>
      assertPenaltyShootoutConcluded(
        { home: 1, away: 0, takenHome: 1, takenAway: 0, firstKickSideKey: 'HOME' },
        A2,
      ),
    ).toThrow(UnprocessableEntityException);
    try {
      assertPenaltyShootoutConcluded(
        { home: 1, away: 0, takenHome: 1, takenAway: 0, firstKickSideKey: 'HOME' },
        A2,
      );
      throw new Error('should have thrown');
    } catch (error) {
      expect((error as UnprocessableEntityException).getResponse()).toMatchObject({
        code: 'TOURNAMENT_PENALTY_UNDECIDED',
      });
    }
  });

  it('operatorOverride가 있으면 미결이어도 통과시킨다 — 기권·중단을 기록할 수 있어야 한다', () => {
    expect(() =>
      assertPenaltyShootoutConcluded(
        { home: 2, away: 0, takenHome: 2, takenAway: 1, operatorOverride: true, firstKickSideKey: 'HOME' },
        A2,
      ),
    ).not.toThrow();
  });

  it('규칙상 결판난 상태는 override 없이 통과한다', () => {
    expect(() =>
      assertPenaltyShootoutConcluded(
        { home: 3, away: 0, takenHome: 3, takenAway: 3, firstKickSideKey: 'HOME' },
        A2,
      ),
    ).not.toThrow();
  });
});
