import { evaluateSuspension, suspensionRulesEnabled } from './card-suspension';

// ─────────────────────────────────────────────────────────────────────────────
// 1차 대회(2026-08-15~16) 회고: "옐로카드 누적, 레드카드 퇴장등 필요해보임".
// 지금까지 라인업 제출은 그 선수가 직전 경기에서 퇴장당했는지를 전혀 검사하지
// 않아 레드카드를 받은 선수가 다음 경기에 그대로 뛸 수 있었다.
//
// 이 스위트가 지키는 계약 중 **가장 중요한 것은 첫 두 개**다.
//   ① 규정을 안 켠 대회는 아무도 정지되지 않는다 (소급 적용 사고 차단)
//   ② 정지는 반드시 풀린다 (한 번 걸리면 영영 못 뛰는 것이 최악의 회귀다)
// ─────────────────────────────────────────────────────────────────────────────

const OFF = { yellowAccumulationLimit: null, redCardSuspensionMatches: null };
const RED_ONLY = { yellowAccumulationLimit: null, redCardSuspensionMatches: 1 };
const YELLOW_ONLY = { yellowAccumulationLimit: 2, redCardSuspensionMatches: null };
const BOTH = { yellowAccumulationLimit: 2, redCardSuspensionMatches: 1 };

function game(gameOrder: number, yellow: number, red: number) {
  return { gameOrder, cards: { yellow, red } };
}

describe('suspensionRulesEnabled', () => {
  it('둘 다 null 이면 꺼진 것으로 본다', () => {
    expect(suspensionRulesEnabled(OFF)).toBe(false);
  });

  it('하나만 켜도 켜진 것으로 본다 — 대회마다 "경고만" 또는 "퇴장만"이 다르다', () => {
    expect(suspensionRulesEnabled(RED_ONLY)).toBe(true);
    expect(suspensionRulesEnabled(YELLOW_ONLY)).toBe(true);
  });

  it('0 이나 음수는 켜진 것으로 보지 않는다 (0으로 두면 매 경기 정지가 된다)', () => {
    expect(suspensionRulesEnabled({ yellowAccumulationLimit: 0, redCardSuspensionMatches: 0 })).toBe(false);
    expect(suspensionRulesEnabled({ yellowAccumulationLimit: -1, redCardSuspensionMatches: null })).toBe(false);
  });
});

describe('evaluateSuspension — 규정 미적용 대회 (소급 적용 사고 차단)', () => {
  // 이 테스트가 깨지면 배포 즉시 이미 끝난 대회들의 선수 다수가 출전정지로 뜬다.
  it('규정을 안 켠 대회는 레드카드가 있어도 정지되지 않는다', () => {
    const verdict = evaluateSuspension({
      rules: OFF,
      played: [game(1, 2, 1), game(2, 3, 2)],
      upcomingGameOrder: 3,
    });
    expect(verdict.suspended).toBe(false);
    expect(verdict.reason).toBeNull();
  });
});

describe('evaluateSuspension — 레드카드', () => {
  it('퇴장당한 바로 다음 경기를 막는다 (회고가 지적한 그 상황)', () => {
    const verdict = evaluateSuspension({ rules: RED_ONLY, played: [game(1, 0, 1)], upcomingGameOrder: 2 });
    expect(verdict.suspended).toBe(true);
    expect(verdict.remainingMatches).toBe(1);
    expect(verdict.reason).toContain('퇴장 1회');
  });

  // ② 정지는 반드시 풀린다.
  it('정지 경기를 지나면 풀린다', () => {
    const verdict = evaluateSuspension({ rules: RED_ONLY, played: [game(1, 0, 1)], upcomingGameOrder: 3 });
    expect(verdict.suspended).toBe(false);
    expect(verdict.remainingMatches).toBe(0);
  });

  it('퇴장 1장당 정지 경기 수가 대회 규정을 따른다', () => {
    const rules = { yellowAccumulationLimit: null, redCardSuspensionMatches: 2 };
    expect(evaluateSuspension({ rules, played: [game(1, 0, 1)], upcomingGameOrder: 2 }).remainingMatches).toBe(2);
    expect(evaluateSuspension({ rules, played: [game(1, 0, 1)], upcomingGameOrder: 3 }).remainingMatches).toBe(1);
    expect(evaluateSuspension({ rules, played: [game(1, 0, 1)], upcomingGameOrder: 4 }).suspended).toBe(false);
  });

  it('퇴장이 두 번이면 정지가 이어 붙는다', () => {
    const played = [game(1, 0, 1), game(3, 0, 1)];
    // 1경기 퇴장 → 2경기 정지. 3경기를 뛰고 또 퇴장 → 4경기 정지.
    expect(evaluateSuspension({ rules: RED_ONLY, played, upcomingGameOrder: 4 }).suspended).toBe(true);
    expect(evaluateSuspension({ rules: RED_ONLY, played, upcomingGameOrder: 5 }).suspended).toBe(false);
  });
});

describe('evaluateSuspension — 경고 누적', () => {
  it('한도에 도달하기 전에는 막지 않는다', () => {
    const verdict = evaluateSuspension({ rules: YELLOW_ONLY, played: [game(1, 1, 0)], upcomingGameOrder: 2 });
    expect(verdict.suspended).toBe(false);
    expect(verdict.yellowTotal).toBe(1);
  });

  it('한도에 도달하면 다음 1경기를 막는다', () => {
    const played = [game(1, 1, 0), game(2, 1, 0)];
    const verdict = evaluateSuspension({ rules: YELLOW_ONLY, played, upcomingGameOrder: 3 });
    expect(verdict.suspended).toBe(true);
    expect(verdict.reason).toContain('경고 2장 누적');
  });

  it('한도의 배수마다 다시 걸린다 (2장·4장)', () => {
    const played = [game(1, 1, 0), game(2, 1, 0), game(4, 1, 0), game(5, 1, 0)];
    // 2장째(2경기) → 3경기 정지 → 4경기 출전 가능
    expect(evaluateSuspension({ rules: YELLOW_ONLY, played, upcomingGameOrder: 4 }).suspended).toBe(false);
    // 4장째(5경기) → 6경기 정지
    expect(evaluateSuspension({ rules: YELLOW_ONLY, played, upcomingGameOrder: 6 }).suspended).toBe(true);
    expect(evaluateSuspension({ rules: YELLOW_ONLY, played, upcomingGameOrder: 7 }).suspended).toBe(false);
  });

  it('한 경기에서 한도만큼 받아도 걸린다', () => {
    const verdict = evaluateSuspension({ rules: YELLOW_ONLY, played: [game(1, 2, 0)], upcomingGameOrder: 2 });
    expect(verdict.suspended).toBe(true);
  });
});

describe('evaluateSuspension — 두 규정을 함께 켠 경우', () => {
  it('같은 경기에서 경고 누적과 퇴장이 겹치면 정지가 합산된다', () => {
    // 1경기: 옐로 2장(누적 한도 도달 → 1경기) + 레드 1장(→ 1경기) = 2경기 정지
    const played = [game(1, 2, 1)];
    expect(evaluateSuspension({ rules: BOTH, played, upcomingGameOrder: 2 }).remainingMatches).toBe(2);
    expect(evaluateSuspension({ rules: BOTH, played, upcomingGameOrder: 4 }).suspended).toBe(false);
  });

  it('사유에 두 원인을 모두 적는다', () => {
    const verdict = evaluateSuspension({ rules: BOTH, played: [game(1, 2, 1)], upcomingGameOrder: 2 });
    expect(verdict.reason).toContain('퇴장 1회');
    expect(verdict.reason).toContain('경고 2장 누적');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2026-08-24 alpha 실측으로 발견한 결함의 회귀 방어.
//
// `suspensionVerdicts`(games.service.ts)가 **공식 확정본만** 세고 있었는데, 경기를
// `end` 해도 결과 리비전은 `SUBMITTED` 로 남고 `currentOfficialRevisionId` 는 null 이다
// (공식 확정은 운영진이 결과 검토를 거쳐 따로 누르는 별도 단계). 당일 대회는 다음
// 경기가 그 검토보다 먼저 시작되는 게 보통이라, **정작 필요한 순간에 가드가 조용히
// 안 걸렸다** — alpha 에서 레드카드 받은 선수가 다음 경기 라인업에 그대로 제출돼
// 201 로 통과하는 것을 실측했다.
//
// 판정 규칙 자체(이 파일)는 그때도 옳았다 — 문제는 **입력을 모으는 쪽**이었다.
// 그래서 여기서는 "직전 경기 기록 하나만 들어와도 즉시 정지가 걸린다"는, 그 입력이
// 제대로 들어왔을 때의 계약을 못박는다.
// ─────────────────────────────────────────────────────────────────────────────
describe('evaluateSuspension — 결과 확정 여부와 무관하게 판정한다', () => {
  it('직전 경기 기록 하나만 있어도 바로 다음 경기를 막는다 (확정 대기 중이어도)', () => {
    const verdict = evaluateSuspension({
      rules: RED_ONLY,
      played: [game(1, 0, 1)],
      upcomingGameOrder: 2,
    });
    expect(verdict.suspended).toBe(true);
    expect(verdict.remainingMatches).toBe(1);
  });
});

describe('evaluateSuspension — 입력이 지저분한 경우', () => {
  it('판정 대상 경기보다 뒤의 기록은 무시한다 (결과 정정으로 미래 카드가 먼저 들어올 수 있다)', () => {
    const played = [game(5, 0, 1)];
    expect(evaluateSuspension({ rules: RED_ONLY, played, upcomingGameOrder: 2 }).suspended).toBe(false);
  });

  it('순서가 뒤섞여 들어와도 일정 순으로 판정한다', () => {
    const played = [game(3, 1, 0), game(1, 1, 0)];
    // 정렬하면 1경기 1장 → 3경기 1장(누적 2) → 4경기 정지
    expect(evaluateSuspension({ rules: YELLOW_ONLY, played, upcomingGameOrder: 4 }).suspended).toBe(true);
  });

  it('음수·NaN 카드 수는 0으로 본다 (정지가 음수 방향으로 새면 안 된다)', () => {
    const played = [{ gameOrder: 1, cards: { yellow: Number.NaN, red: -3 } }];
    const verdict = evaluateSuspension({ rules: BOTH, played, upcomingGameOrder: 2 });
    expect(verdict.suspended).toBe(false);
    expect(verdict.yellowTotal).toBe(0);
    expect(verdict.redTotal).toBe(0);
  });

  it('기록이 하나도 없으면 정지되지 않는다', () => {
    expect(evaluateSuspension({ rules: BOTH, played: [], upcomingGameOrder: 1 }).suspended).toBe(false);
  });
});
