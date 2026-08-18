import { describe, expect, it } from 'vitest';
import {
  nextPenaltyKicker,
  penaltyScoreBySideId,
  penaltyShootoutOutcome,
  penaltyFinishAvailability,
  type PenaltyKick,
  type PenaltyKickResult,
  type PenaltyShootoutPolicy,
} from './penalty-shootout';

const HOME = 'side-home';
const AWAY = 'side-away';
const SIDES = [{ id: HOME }, { id: AWAY }];

function kick(sideId: string, result: PenaltyKickResult): PenaltyKick {
  return { sideId, result };
}

/**
 * 한 사이드의 킥 `taken`개(앞의 `scored`개는 성공, 나머지는 실패)를 만든다.
 *
 * 결판 술어는 **킥 순서를 보지 않고** 사이드별 "찬 수 / 넣은 수"만 센다 —
 * 그래서 여기서 두 팀 킥을 번갈아 배치하지 않아도 판정 결과는 같다(교대 규칙을
 * 지키는 책임은 `nextPenaltyKicker` 쪽이고, 그건 위 describe가 따로 검증한다).
 * 이 함수를 인터리브하도록 바꾸면 아래 "선축 4킥 / 후축 3킥"처럼 **킥 수가
 * 다른** 국면(= 승부차기 진행 중 항상 존재하는 국면)을 표현할 수 없다.
 */
function kicksFor(sideId: string, taken: number, scored: number): PenaltyKick[] {
  return Array.from({ length: taken }, (_, index) => kick(sideId, index < scored ? 'SCORED' : 'MISSED'));
}

/**
 * 첫 킥 주체는 **동전 던지기 결과**(선축)로 정해진다 — 홈이 아니다.
 *
 * 이전 테스트는 `'아직 킥이 없으면 sides[0](홈)이 먼저 찬다'` 하나였고, 그 시점의
 * 의도는 "첫 킥 주체가 결정론적으로 정해진다"였다(당시엔 그게 곧 홈이었다).
 * 그런데 `sides`의 순서는 서버 `getGame`의 `orderBy: { sideKey: 'asc' }` + enum
 * `HOME, AWAY` 때문에 **항상 HOME이 [0]**이라, 그 테스트는 "홈이 무조건 선축"이라는
 * 결함을 정답으로 박제하고 있었다. 의도는 살리고(첫 킥 주체는 결정론적) 기준만
 * 선축으로 바꾼다.
 */
describe('nextPenaltyKicker', () => {
  it('선축이 원정이면 첫 킥은 원정이 찬다', () => {
    expect(nextPenaltyKicker([], SIDES, AWAY)).toBe(AWAY);
  });

  it('선축이 홈이면 첫 킥은 홈이 찬다', () => {
    expect(nextPenaltyKicker([], SIDES, HOME)).toBe(HOME);
  });

  it('선축을 아직 정하지 않았으면 찰 주체가 없다 — 성공/실패 버튼이 잠기는 근거다', () => {
    expect(nextPenaltyKicker([], SIDES, null)).toBeNull();
  });

  /**
   * 교대 규칙 자체는 원래 정상이었으므로 그대로 유지한다. 다만 선축이 원정이면
   * 교대 순서 전체가 원정→홈으로 뒤집힌다는 것까지 확인한다 — 위 첫 킥 테스트가
   * 빨간데 이 테스트가 초록이면, 실패 원인이 "교대 계산"이 아니라 정확히
   * "첫 킥 주체 하드코딩"임이 파일 안에서 증명된다.
   */
  it('두 팀이 번갈아 찬다 — 선축이 원정이면 그 뒤 순서도 원정 → 홈으로 뒤집힌다', () => {
    const firstKick: PenaltyKick[] = [kick(AWAY, 'SCORED')];
    expect(nextPenaltyKicker(firstKick, SIDES, AWAY)).toBe(HOME);
    expect(nextPenaltyKicker([...firstKick, kick(HOME, 'MISSED')], SIDES, AWAY)).toBe(AWAY);
  });

  it('선축이 홈이어도 교대 규칙은 같다 — 홈 → 원정 → 홈', () => {
    const firstKick: PenaltyKick[] = [kick(HOME, 'SCORED')];
    expect(nextPenaltyKicker(firstKick, SIDES, HOME)).toBe(AWAY);
    expect(nextPenaltyKicker([...firstKick, kick(AWAY, 'MISSED')], SIDES, HOME)).toBe(HOME);
  });

  it('사이드가 없으면 null', () => {
    expect(nextPenaltyKicker([], [], null)).toBeNull();
  });
});

describe('penaltyScoreBySideId', () => {
  it('성공(SCORED) 킥만 사이드별로 센다', () => {
    const kicks: PenaltyKick[] = [
      kick(HOME, 'SCORED'),
      kick(AWAY, 'MISSED'),
      kick(HOME, 'SCORED'),
      kick(AWAY, 'SCORED'),
    ];
    const score = penaltyScoreBySideId(kicks);
    expect(score.get(HOME)).toBe(2);
    expect(score.get(AWAY)).toBe(1);
  });

  it('킥이 없으면 빈 맵이다(호출부는 ?? 0으로 읽는다)', () => {
    expect(penaltyScoreBySideId([]).size).toBe(0);
  });
});

/**
 * 결판 판정 — `isPenaltyShootoutDecisive(home, away) { return home !== away; }`를
 * 대체한다.
 *
 * 옛 술어는 **점수 두 개만** 봤고 킥 수를 몰랐다. 그래서 홈이 첫 킥을 성공한 순간
 * 1:0이 되어 "결판"으로 읽혔고, 패널의 `disabled={!decisive}`가 풀려 **원정이 한
 * 번도 차기 전에** '승부차기 종료'를 누를 수 있었다(사용자 보고 결함). 옛 테스트가
 * 지키던 의도 — "무승부 승부차기는 서버 `extractEndPenalties`가 422로 거부하므로
 * 프론트도 같은 기준으로 막는다" — 는 아래 '같은 킥 수 + 동점' 케이스로 그대로
 * 승계한다.
 *
 * `earlyStop`은 대회 설정(`CompetitionConfig.result`)에서 오는 스위치다:
 *  - `true`  (A2, FIFA 정규 · 기본값) — 5킥 이내라도 남은 킥으로 뒤집을 수 없으면 종료.
 *  - `false` (A1, 끝까지) — 두 팀이 같은 횟수를 찬 뒤 점수가 갈려야 종료.
 *
 * 두 정책은 "한쪽이라도 0킥이면 확정하지 않는다"는 불변식을 **공유**한다.
 */
describe('penaltyShootoutOutcome', () => {
  it('원정이 아직 한 번도 차지 않았으면 홈이 1점을 넣어도 확정하지 않는다 — 사용자 보고 결함', () => {
    const kicks = kicksFor(HOME, 1, 1);
    expect(penaltyShootoutOutcome(kicks, SIDES, HOME, { earlyStop: true })).toBe('IN_PROGRESS');
  });

  it('한쪽이 0킥이면 어떤 정책에서도 확정하지 않는다 — 두 정책이 공유하는 불변식', () => {
    const kicks = kicksFor(HOME, 3, 3);
    expect(penaltyShootoutOutcome(kicks, SIDES, HOME, { earlyStop: true })).toBe('IN_PROGRESS');
    expect(penaltyShootoutOutcome(kicks, SIDES, HOME, { earlyStop: false })).toBe('IN_PROGRESS');
  });

  /**
   * 위 케이스는 5킥 산술만으로도 통과하므로(3 > 0+5가 거짓) "0킥 금지" 문장을 지우면
   * 그대로 초록이다 — 즉 그 문장을 **못 박지 못한다**. 이 케이스가 그 문장의 유일한
   * 증거다: 선축 6킥 6점 / 후축 0킥이면 `remainingSecond`가 5라 `6 > 0 + 5`가 성립해,
   * 0킥 가드가 없으면 **후축이 한 번도 차지 않았는데 DECIDED**가 나온다.
   */
  it('선축 6킥 6점 / 후축 0킥도 확정하지 않는다 — 5킥 산술을 통과해 버리는 유일한 구멍', () => {
    const kicks = kicksFor(HOME, 6, 6);
    expect(penaltyShootoutOutcome(kicks, SIDES, HOME, { earlyStop: true })).toBe('IN_PROGRESS');
    expect(penaltyShootoutOutcome(kicks, SIDES, HOME, { earlyStop: false })).toBe('IN_PROGRESS');
  });

  /**
   * **스위치가 실제로 동작한다는 유일한 증거.** 같은 입력에서 두 정책의 답이 갈리는
   * 국면이 하나도 없으면 `earlyStop`을 배선만 해놓고 읽지 않아도 테스트가 전부
   * 통과한다. 선축 4킥 4점 / 후축 3킥 0점 = 후축이 남은 2킥을 다 넣어도 2점이라
   * 수학적으로 이미 끝났다(A2는 종료), 그러나 킥 수가 다르다(A1은 계속).
   */
  it('선축 4킥 4점 / 후축 3킥 0점 — earlyStop이면 확정, 아니면 계속', () => {
    const kicks = [...kicksFor(HOME, 4, 4), ...kicksFor(AWAY, 3, 0)];
    expect(penaltyShootoutOutcome(kicks, SIDES, HOME, { earlyStop: true })).toBe('DECIDED');
    expect(penaltyShootoutOutcome(kicks, SIDES, HOME, { earlyStop: false })).toBe('IN_PROGRESS');
  });

  /**
   * A2는 오늘(`home !== away`)보다 **느슨한 게 아니라 더 엄격하다.** 각 3킥 2:1은
   * 오늘 결판으로 읽히지만, 남은 2킥으로 뒤집을 수 있으므로 아직 미결이다.
   *
   * A1은 여기서 갈린다: A1의 기준은 "수학적으로 확정됐는가"가 아니라 **"라운드가
   * 끝났는가"**다. 같은 횟수를 찼고 점수가 갈렸으므로 A1은 이 라운드에서 종료한다.
   */
  it('각 3킥 2:1 — A2는 아직 뒤집힐 수 있어 미결, A1은 라운드가 끝나 확정', () => {
    const kicks = [...kicksFor(HOME, 3, 2), ...kicksFor(AWAY, 3, 1)];
    expect(penaltyShootoutOutcome(kicks, SIDES, HOME, { earlyStop: true })).toBe('IN_PROGRESS');
    expect(penaltyShootoutOutcome(kicks, SIDES, HOME, { earlyStop: false })).toBe('DECIDED');
  });

  /**
   * A1이 5킥 구간을 통째로 잠그면 안 된다는 증거. 각 3킥 3:0은 후축이 남은 2킥을 다
   * 넣어도 2점이라 현장에서 이미 끝난 승부차기다. 여기서 A1이 미결을 돌려주면
   * "승부차기 종료"가 영영 안 켜져, 운영자는 **차지도 않은 킥 4개를 지어내야만**
   * 경기를 닫을 수 있다(결선 브래킷이 그 자리에서 멈춘다).
   */
  it('각 3킥 3:0은 A1에서도 확정한다 — 라운드가 끝났고 점수가 갈렸다', () => {
    const kicks = [...kicksFor(HOME, 3, 3), ...kicksFor(AWAY, 3, 0)];
    expect(penaltyShootoutOutcome(kicks, SIDES, HOME, { earlyStop: false })).toBe('DECIDED');
    expect(penaltyShootoutOutcome(kicks, SIDES, HOME, { earlyStop: true })).toBe('DECIDED');
  });

  it('5킥씩 다 차고 점수가 갈리면 두 정책 모두 확정한다', () => {
    const kicks = [...kicksFor(HOME, 5, 5), ...kicksFor(AWAY, 5, 4)];
    expect(penaltyShootoutOutcome(kicks, SIDES, HOME, { earlyStop: true })).toBe('DECIDED');
    expect(penaltyShootoutOutcome(kicks, SIDES, HOME, { earlyStop: false })).toBe('DECIDED');
  });

  /** 옛 `isPenaltyShootoutDecisive` 테스트의 의도 승계 — 무승부 승부차기는 서버
   *  `extractEndPenalties`가 422 `TOURNAMENT_PENALTY_INVALID`로 거부한다. */
  it('같은 횟수를 찼는데 점수가 같으면 확정하지 않는다 — 백엔드 extractEndPenalties와 같은 기준', () => {
    const kicks = [...kicksFor(HOME, 5, 3), ...kicksFor(AWAY, 5, 3)];
    expect(penaltyShootoutOutcome(kicks, SIDES, HOME, { earlyStop: true })).toBe('IN_PROGRESS');
    expect(penaltyShootoutOutcome(kicks, SIDES, HOME, { earlyStop: false })).toBe('IN_PROGRESS');
  });

  it('서든데스에서는 같은 횟수를 찬 뒤 점수가 갈려야 확정한다', () => {
    const level = [...kicksFor(HOME, 6, 5), ...kicksFor(AWAY, 6, 5)];
    expect(penaltyShootoutOutcome(level, SIDES, HOME, { earlyStop: true })).toBe('IN_PROGRESS');

    const decided = [...kicksFor(HOME, 6, 6), ...kicksFor(AWAY, 6, 5)];
    expect(penaltyShootoutOutcome(decided, SIDES, HOME, { earlyStop: true })).toBe('DECIDED');
  });

  it('서든데스 도중 한쪽만 더 찬 국면은 확정하지 않는다 — 후축이 아직 답할 기회가 있다', () => {
    const kicks = [...kicksFor(HOME, 6, 6), ...kicksFor(AWAY, 5, 5)];
    expect(penaltyShootoutOutcome(kicks, SIDES, HOME, { earlyStop: true })).toBe('IN_PROGRESS');
  });

  /**
   * 선축이 원정일 때도 같은 판정이 나와야 한다 — 술어가 `sides[0]`(항상 HOME)을
   * 선축으로 가정하면 이 케이스가 깨진다. 위 '4킥 4점 / 3킥 0점'의 홈·원정을
   * 그대로 뒤집은 것이다.
   */
  it('선축이 원정이어도 대칭으로 판정한다 — 홈 하드코딩 회귀를 잡는다', () => {
    const kicks = [...kicksFor(AWAY, 4, 4), ...kicksFor(HOME, 3, 0)];
    expect(penaltyShootoutOutcome(kicks, SIDES, AWAY, { earlyStop: true })).toBe('DECIDED');
    expect(penaltyShootoutOutcome(kicks, SIDES, AWAY, { earlyStop: false })).toBe('IN_PROGRESS');
  });

  it('선축을 아직 정하지 않았으면 확정하지 않는다', () => {
    const kicks = [...kicksFor(HOME, 5, 5), ...kicksFor(AWAY, 5, 4)];
    expect(penaltyShootoutOutcome(kicks, SIDES, null, { earlyStop: true })).toBe('IN_PROGRESS');
  });

  it('사이드가 2개가 아니면(방어적 케이스) 확정하지 않는다', () => {
    expect(penaltyShootoutOutcome([], [], null, { earlyStop: true })).toBe('IN_PROGRESS');
    expect(penaltyShootoutOutcome(kicksFor(HOME, 1, 1), [{ id: HOME }], HOME, { earlyStop: true })).toBe(
      'IN_PROGRESS',
    );
  });
});

describe('penaltyFinishAvailability — 운영자가 경기를 닫을 수 있는 상태', () => {
  const SIDES = [{ id: 'home' }, { id: 'away' }];
  const A2: PenaltyShootoutPolicy = { earlyStop: true };
  const A1: PenaltyShootoutPolicy = { earlyStop: false };
  const kick = (sideId: string, result: PenaltyKickResult): PenaltyKick => ({ sideId, result });

  it('규칙상 결판난 상태는 READY — 우회 버튼 없이 그냥 종료된다', () => {
    // 각 3킥, 선축 3점 : 후축 0점 (잔여 2킥으로 역전 불가)
    const kicks = [
      kick('home', 'SCORED'), kick('away', 'MISSED'),
      kick('home', 'SCORED'), kick('away', 'MISSED'),
      kick('home', 'SCORED'), kick('away', 'MISSED'),
    ];
    expect(penaltyFinishAvailability(kicks, SIDES, 'home', A2)).toBe('READY');
  });

  it('킥 수가 달라 자동 판정이 멈춘 상태는 OVERRIDABLE — 기권·중단이 여기로 온다', () => {
    // 홈 2킥 2점 / 원정 1킥 0점: 원정이 남은 4킥을 다 넣으면 역전 가능해 규칙상 미결.
    // 그러나 원정이 기권하면 이 상태가 최종이고, 닫지 못하면 경기가 영원히 열려 있다.
    const kicks = [
      kick('home', 'SCORED'), kick('away', 'MISSED'),
      kick('home', 'SCORED'),
    ];
    expect(penaltyShootoutOutcome(kicks, SIDES, 'home', A2)).toBe('IN_PROGRESS');
    expect(penaltyFinishAvailability(kicks, SIDES, 'home', A2)).toBe('OVERRIDABLE');
  });

  it('서든데스에서 킥 수가 하나 어긋난 상태도 OVERRIDABLE', () => {
    // 양 팀 5킥씩 1:0으로 이미 갈렸는데 홈이 6번째를 더 찬 국면 — 서든데스 규칙은
    // "같은 횟수"를 요구하므로 자동으로는 안 끝나지만, 원정이 더 못 차면 닫아야 한다.
    const kicks = [
      ...Array.from({ length: 5 }, (): PenaltyKick[] => [kick('home', 'MISSED'), kick('away', 'MISSED')]).flat(),
      kick('home', 'SCORED'),
    ];
    expect(penaltyShootoutOutcome(kicks, SIDES, 'home', A2)).toBe('IN_PROGRESS');
    expect(penaltyFinishAvailability(kicks, SIDES, 'home', A2)).toBe('OVERRIDABLE');
  });

  it('A1(끝까지 차는 정책)에서 킥 수가 다르면 OVERRIDABLE — 정책과 무관하게 닫는 길은 남는다', () => {
    const kicks = [kick('home', 'SCORED'), kick('away', 'MISSED'), kick('home', 'SCORED')];
    expect(penaltyShootoutOutcome(kicks, SIDES, 'home', A1)).toBe('IN_PROGRESS');
    expect(penaltyFinishAvailability(kicks, SIDES, 'home', A1)).toBe('OVERRIDABLE');
  });

  it('점수가 같으면 BLOCKED — 서버가 TOURNAMENT_PENALTY_INVALID로 되돌린다', () => {
    // 눌러도 실패할 버튼을 열어 주면 운영자를 속이는 것이라, 우회 경로를 주지 않는다.
    const kicks = [kick('home', 'SCORED'), kick('away', 'SCORED')];
    expect(penaltyFinishAvailability(kicks, SIDES, 'home', A2)).toBe('BLOCKED');
  });

  it('킥이 하나도 없으면 BLOCKED — 양쪽 0점이라 보낼 결과 자체가 없다', () => {
    expect(penaltyFinishAvailability([], SIDES, 'home', A2)).toBe('BLOCKED');
  });

  it('선축을 안 골랐으면 BLOCKED — 선축 없이는 payload를 만들 수 없다', () => {
    const kicks = [kick('home', 'SCORED')];
    expect(penaltyFinishAvailability(kicks, SIDES, null, A2)).toBe('BLOCKED');
  });

  it('사이드가 2개가 아니면 BLOCKED', () => {
    const kicks = [kick('home', 'SCORED')];
    expect(penaltyFinishAvailability(kicks, [{ id: 'home' }], 'home', A2)).toBe('BLOCKED');
  });
});
