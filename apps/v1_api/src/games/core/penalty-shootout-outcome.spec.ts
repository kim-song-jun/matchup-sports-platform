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

  it('각 1킥 1:0은 두 정책 모두 미결이다 — 1라운드 종료는 어떤 규정에도 없다', () => {
    // 2026-08-18 정정: 예전 A1은 여기서 결판을 냈다(`earlyStop: false`라는 이름과 정반대).
    const counts = { home: 1, away: 0, takenHome: 1, takenAway: 1, firstKickSideKey: 'HOME' } as const;
    expect(penaltyShootoutDecided(counts, A2)).toBe(false);
    expect(penaltyShootoutDecided(counts, A1)).toBe(false);
  });

  it('각 3킥 3:0 — A2는 역전 불가라 결판, A1은 5킥을 마저 차야 한다', () => {
    const counts = { home: 3, away: 0, takenHome: 3, takenAway: 3, firstKickSideKey: 'HOME' } as const;
    expect(penaltyShootoutDecided(counts, A2)).toBe(true);
    expect(penaltyShootoutDecided(counts, A1)).toBe(false);
  });

  it('A1도 5킥을 다 채우면 판정한다', () => {
    expect(
      penaltyShootoutDecided({ home: 3, away: 1, takenHome: 5, takenAway: 5, firstKickSideKey: 'HOME' }, A1),
    ).toBe(true);
  });

  it('선축 4킥 4점 / 후축 3킥 0점은 A2에서 결판, A1에서는 미결 — 두 정책이 갈리는 지점', () => {
    const counts = { home: 4, away: 0, takenHome: 4, takenAway: 3, firstKickSideKey: 'HOME' } as const;
    expect(penaltyShootoutDecided(counts, A2)).toBe(true);
    expect(penaltyShootoutDecided(counts, A1)).toBe(false);
    // A1이 여기서 미결인 이유는 "킥 수가 달라서"가 아니라 **5킥을 안 채워서**다.
  });

  it('선축이 원정일 때 잔여 킥을 원정 기준으로 센다 — 홈으로 굳으면 답이 갈린다', () => {
    // 원정 선축 4킥 4점 / 홈 3킥 0점. 선축을 홈으로 착각하면 "선축 3킥 0점 /
    // 후축 4킥 4점"으로 읽혀 잔여 계산이 뒤집힌다.
    expect(
      penaltyShootoutDecided({ home: 0, away: 4, takenHome: 3, takenAway: 4, firstKickSideKey: 'AWAY' }, A2),
    ).toBe(true);
  });

  /**
   * **2026-08-18 알파 실측 — 이 자리의 예전 테스트가 결함을 통과시켰다.**
   *
   * 예전엔 `4/3`과 `3/3`만 검증하고 **`1/1`을 빼먹어서**, 선축 미상 분기가 5킥 바닥 없이
   * `takenHome === takenAway` 한 줄이던 것을 잡지 못했다. 그 결과 **키 하나만 빼면 게이트가
   * 통째로 뚫렸다** — 라이브에서 같은 경기·같은 버전으로 재현했다:
   *
   *   `{home:1, away:0, takenHome:1, takenAway:1, firstKickSideKey:'HOME'}` → 422 UNDECIDED
   *   `{home:1, away:0, takenHome:1, takenAway:1}`                          → **201 통과**
   *
   * 선축을 모르면 잔여 킥을 계산할 수 없으므로 **조기 종료를 아예 허용하지 않는다** —
   * A1과 같은 문장(5킥 바닥 + 같은 횟수)을 쓴다.
   */
  it('선축을 모르면 조기 종료를 허용하지 않는다 — 5킥을 다 채워야 결판이다', () => {
    // ★ 회귀의 핵심 케이스: 각 1킥. 예전 구현은 `1 === 1`로 결판을 냈다.
    expect(penaltyShootoutDecided({ home: 1, away: 0, takenHome: 1, takenAway: 1 }, A2)).toBe(false);
    expect(penaltyShootoutDecided({ home: 1, away: 0, takenHome: 1, takenAway: 1 }, A1)).toBe(false);
    // 5킥 미만은 같은 횟수여도 결판이 아니다.
    expect(penaltyShootoutDecided({ home: 3, away: 0, takenHome: 3, takenAway: 3 }, A2)).toBe(false);
    // 킥 수가 다르면 당연히 결판이 아니다(선축 하드코딩으로 되돌아가지 않는다).
    expect(penaltyShootoutDecided({ home: 4, away: 0, takenHome: 4, takenAway: 3 }, A2)).toBe(false);
    // 5킥을 다 채우고 같은 횟수를 찼으면 결판이다 — 잠가 두기만 하는 분기가 아니다.
    expect(penaltyShootoutDecided({ home: 3, away: 1, takenHome: 5, takenAway: 5 }, A2)).toBe(true);
  });

  it('선축 미상 분기가 선축을 아는 경우보다 느슨하면 안 된다 — 두 정책 어느 쪽보다도', () => {
    // 이 단언이 D-1의 본질이다: 키를 빼는 것이 **완화**가 되면 게이트는 있으나 마나다.
    for (const policy of [A1, A2]) {
      for (const [takenHome, takenAway] of [[1, 1], [2, 2], [3, 3], [4, 4], [4, 3]] as const) {
        const withSide = penaltyShootoutDecided(
          { home: takenHome, away: 0, takenHome, takenAway, firstKickSideKey: 'HOME' },
          policy,
        );
        const withoutSide = penaltyShootoutDecided({ home: takenHome, away: 0, takenHome, takenAway }, policy);
        // 선축을 모를 때 DECIDED 라면, 아는 경우에도 DECIDED 여야 한다.
        if (withoutSide) expect(withSide).toBe(true);
      }
    }
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

/**
 * 2026-08-18 알파 실측 재현 — 이 테스트가 지키는 것은 **경로 C가 다시 열리지 않는 것**이다.
 *
 * 킥 수 없이 `POST /games/:id/commands/end` 에 `{ home: 1, away: 0 }` 만 실어 보내면
 * HTTP 201 로 통과했고, 원정이 한 번도 차지 않은 승부차기가 공식 결과가 되어 공개
 * 관전자 화면(`scoreStatus: "official"`)까지 퍼졌다. 화면의 가드는 프런트에만 있어
 * 이 경로를 전혀 막지 못했다.
 *
 * 게이트 자체는 서비스 레인(`assertPenaltyShootoutConcludedForGame`)에 있고 트랜잭션이
 * 필요하지만, 그 판정이 기대는 **순수 규칙**은 여기서 고정한다: 킥 수가 없으면 정책
 * 판정을 할 수 없다는 것. 아래 두 단언이 그 전제를 명시한다.
 */
describe('킥 수가 없으면 판정 자체가 불가능하다 (경로 C 회귀 방지)', () => {
  it('총점만으로는 정상과 비정상이 같은 값이라 구분할 수 없다', () => {
    // 알파에서 실제로 저장된 비정상 값과, 정상적으로 도달 가능한 값이 총점상 동일하다.
    const 비정상 = { home: 1, away: 0, takenHome: 1, takenAway: 0, firstKickSideKey: 'HOME' } as const;
    const 정상 = { home: 1, away: 0, takenHome: 5, takenAway: 5, firstKickSideKey: 'HOME' } as const;
    expect({ home: 비정상.home, away: 비정상.away }).toEqual({ home: 정상.home, away: 정상.away });
    // 킥 수가 있으면 갈린다 — 그래서 `end` 레인은 킥 수를 필수로 요구한다.
    expect(penaltyShootoutDecided(비정상, A2)).toBe(false);
    expect(penaltyShootoutDecided(정상, A2)).toBe(true);
  });

  it('킥 수가 없으면 게이트가 통과시킨다 — 그래서 레인 구분이 유일한 방어선이다', () => {
    // 이 함수는 복구 레인용 degrade 를 유지한다. `end` 레인의 차단은 호출부
    // (`assertPenaltyShootoutConcludedForGame`)가 담당한다는 계약을 명시한다.
    expect(() => assertPenaltyShootoutConcluded({ home: 1, away: 0 }, A2)).not.toThrow();
  });
});
