import {
  buildPlayerCard,
  MIN_APPEARANCES_FOR_RATE_STATS,
  PLAYER_CARD_FORMULA_VERSION,
  resolveTier,
  resolveCardShape,
  unlockedCardShapes,
  MIN_REVIEWS_FOR_SHIELD_SHAPE,
  type PlayerCardInput,
  type PlayerCardStatCode,
} from './player-card';

/**
 * Task 155 선수 카드 산식.
 *
 * 여기 있는 단언은 전부 "이게 깨지면 카드가 사용자에게 거짓말을 한다"는 것들이다.
 * 숫자 하나하나를 박제하는 골든 테스트가 아니라, 산식이 **지켜야 하는 성질**을 건다 --
 * 계수는 튜닝될 수 있지만 성질은 바뀌면 안 된다.
 */

const base: PlayerCardInput = {
  appearances: 0,
  goals: 0,
  assists: 0,
  startedCount: 0,
  position: 'MF',
  jerseyNumber: 7,
  skillScore: null,
  mannerScore: null,
  punctualityScore: null,
  reviewCount: 0,
  recordsConsented: true,
  hasRecordLinks: true,
};

const stat = (input: PlayerCardInput, code: PlayerCardStatCode) =>
  buildPlayerCard(input).stats.find((s) => s.code === code)!;

describe('선수 카드 산식', () => {
  describe('표본이 모자라면 숫자를 만들지 않는다', () => {
    it('1경기 1골은 SHO 를 잠근다 -- 경기당 1골이라고 99 를 주지 않는다', () => {
      const card = buildPlayerCard({ ...base, appearances: 1, goals: 1, startedCount: 1 });
      const sho = card.stats.find((s) => s.code === 'SHO')!;

      expect(sho.unlocked).toBe(false);
      expect(sho.value).toBeNull();
      expect(sho.lockedBy).toEqual({ type: 'appearances', remaining: MIN_APPEARANCES_FOR_RATE_STATS - 1 });
    });

    it('3경기부터 SHO 가 열린다', () => {
      const sho = stat({ ...base, appearances: 3, goals: 3, startedCount: 3 }, 'SHO');

      expect(sho.unlocked).toBe(true);
      // 경기당 1골 = 30 + 55 = 85. 계수가 바뀌어도 "상위권이지만 만점은 아니다"는 유지돼야 한다.
      expect(sho.value).toBeGreaterThan(70);
      expect(sho.value).toBeLessThan(99);
    });

    it('후기 2건이면 실력·매너·시간약속이 모두 잠긴다', () => {
      const card = buildPlayerCard({
        ...base,
        appearances: 5,
        reviewCount: 2,
        skillScore: 5,
        mannerScore: 5,
        punctualityScore: 5,
      });

      for (const code of ['SKI', 'MAN', 'PUN'] as const) {
        const found = card.stats.find((s) => s.code === code)!;
        expect(found.unlocked).toBe(false);
        expect(found.lockedBy).toEqual({ type: 'reviews', remaining: 1 });
      }
    });

    it('후기 수는 충족해도 평균이 없으면 잠긴다 -- 없는 값을 0 으로 대체하지 않는다', () => {
      const ski = stat({ ...base, appearances: 5, reviewCount: 9, skillScore: null }, 'SKI');

      expect(ski.unlocked).toBe(false);
      expect(ski.value).toBeNull();
    });
  });

  describe('연결된 기록이 아예 없는 사용자', () => {
    // alpha 실측(2026-08-24)에서 잡았다. 출전이 0인 사용자에게도 카드가
    // "기록 공개를 켜면 골·도움·출전이 열려요" 라고 말하고 있었다 -- 켜도 아무것도
    // 열리지 않으므로 거짓 약속이다. 그 사람에게 필요한 건 동의가 아니라 경기다.
    it('동의가 아니라 출전을 안내한다', () => {
      const card = buildPlayerCard({ ...base, recordsConsented: false, hasRecordLinks: false });

      expect(card.nextUnlock?.reason).toEqual({ type: 'appearances', remaining: 1 });
      for (const code of ['SHO', 'PAS', 'APP'] as const) {
        expect(card.stats.find((s) => s.code === code)!.lockedBy).not.toEqual({ type: 'consent' });
      }
    });

    it('동의를 이미 켠 사람에게도 마찬가지다 -- 기록이 없으면 열 것이 없다', () => {
      const card = buildPlayerCard({ ...base, recordsConsented: true, hasRecordLinks: false });

      expect(card.nextUnlock?.reason).toEqual({ type: 'appearances', remaining: 1 });
    });
  });

  describe('기록 공개 동의', () => {
    it('동의가 없으면 출전이 아무리 많아도 기록 3항목이 잠긴다', () => {
      const card = buildPlayerCard({
        ...base,
        appearances: 40,
        goals: 30,
        assists: 20,
        startedCount: 40,
        recordsConsented: false,
        hasRecordLinks: true,
      });

      for (const code of ['SHO', 'PAS', 'APP'] as const) {
        const found = card.stats.find((s) => s.code === code)!;
        expect(found.unlocked).toBe(false);
        expect(found.lockedBy).toEqual({ type: 'consent' });
      }
    });

    it('동의 잠금은 다음 해제 안내에서 최우선이다 -- 한 번에 세 개가 열리므로', () => {
      const card = buildPlayerCard({
        ...base,
        appearances: 40,
        goals: 30,
        recordsConsented: false,
        hasRecordLinks: true,
        reviewCount: 1,
        skillScore: 4,
        mannerScore: 4,
        punctualityScore: 4,
      });

      expect(card.nextUnlock?.reason).toEqual({ type: 'consent' });
    });
  });

  describe('총점', () => {
    it('잠긴 능력치는 총점에서 빠진다 -- 후기가 없다고 총점이 깎이지 않는다', () => {
      const withoutReviews = buildPlayerCard({
        ...base,
        appearances: 10,
        goals: 10,
        assists: 10,
        startedCount: 10,
      });
      const withLowReviews = buildPlayerCard({
        ...base,
        appearances: 10,
        goals: 10,
        assists: 10,
        startedCount: 10,
        reviewCount: 5,
        skillScore: 1,
        mannerScore: 1,
        punctualityScore: 1,
      });

      // 후기가 아예 없는 쪽이, 최저점 후기를 받은 쪽보다 총점이 높아야 한다.
      // 잠긴 값을 0 으로 넣어 평균 냈다면 이 관계가 뒤집힌다.
      expect(withoutReviews.overall).not.toBeNull();
      expect(withLowReviews.overall).not.toBeNull();
      expect(withoutReviews.overall as number).toBeGreaterThan(withLowReviews.overall as number);
    });

    it('열린 능력치가 하나도 없으면 총점은 null 이다 -- 숫자를 짜내지 않는다', () => {
      const card = buildPlayerCard({ ...base, appearances: 0, recordsConsented: false, hasRecordLinks: true });

      expect(card.overall).toBeNull();
      expect(card.unlockedCount).toBe(0);
    });

    it('포지션 가중치는 기록의 성격에 맞는 쪽을 올린다 (양방향)', () => {
      // 골이 몰린 기록: SHO 가중치가 높은 FW 가 GK 보다 높아야 한다.
      const striker = { ...base, appearances: 3, goals: 6, assists: 0, startedCount: 3 };
      expect(buildPlayerCard({ ...striker, position: 'FW' }).overall as number).toBeGreaterThan(
        buildPlayerCard({ ...striker, position: 'GK' }).overall as number,
      );

      // 골 없이 출전만 쌓인 기록: APP 가중치가 높은 GK 가 FW 보다 높아야 한다.
      // 한 방향만 검사하면 "SHO 가중치만 크게 준 산식"도 통과해버린다.
      const grinder = { ...base, appearances: 30, goals: 0, assists: 0, startedCount: 30 };
      expect(buildPlayerCard({ ...grinder, position: 'GK' }).overall as number).toBeGreaterThan(
        buildPlayerCard({ ...grinder, position: 'FW' }).overall as number,
      );
    });
  });

  describe('등급', () => {
    it('출전 수만 본다 -- 총점과 무관하다', () => {
      expect(resolveTier(0)).toBe('bronze');
      expect(resolveTier(4)).toBe('bronze');
      expect(resolveTier(5)).toBe('silver');
      expect(resolveTier(14)).toBe('silver');
      expect(resolveTier(15)).toBe('gold');
      expect(resolveTier(29)).toBe('gold');
      expect(resolveTier(30)).toBe('special');
    });

    it('기록을 비공개해도 등급은 출전 수를 따른다', () => {
      const hidden = buildPlayerCard({ ...base, appearances: 20, recordsConsented: false, hasRecordLinks: true });

      expect(hidden.tier).toBe('gold');
      // 다만 능력치는 잠겨 있으므로 총점은 후기에서만 나온다(여기서는 후기도 없어 null).
      expect(hidden.overall).toBeNull();
    });
  });

  describe('값의 범위', () => {
    it('아무리 좋아도 99 를 넘지 않고, 아무리 나빠도 0 이 되지 않는다', () => {
      const monster = buildPlayerCard({
        ...base,
        appearances: 200,
        goals: 900,
        assists: 900,
        startedCount: 200,
        reviewCount: 100,
        skillScore: 5,
        mannerScore: 5,
        punctualityScore: 5,
      });
      const rookie = buildPlayerCard({
        ...base,
        appearances: 3,
        goals: 0,
        assists: 0,
        startedCount: 0,
        reviewCount: 3,
        skillScore: 1,
        mannerScore: 1,
        punctualityScore: 1,
      });

      for (const s of [...monster.stats, ...rookie.stats]) {
        if (s.value === null) continue;
        expect(s.value).toBeGreaterThanOrEqual(1);
        expect(s.value).toBeLessThanOrEqual(99);
      }
    });
  });

  it('등번호는 계산에 쓰이지 않고 그대로 통과한다', () => {
    // 등번호가 총점이나 능력치에 영향을 주면 안 된다 -- 표시 전용 값이다.
    const withJersey = buildPlayerCard({ ...base, appearances: 10, goals: 5, startedCount: 10, jerseyNumber: 99 });
    const withoutJersey = buildPlayerCard({ ...base, appearances: 10, goals: 5, startedCount: 10, jerseyNumber: null });

    expect(withJersey.jerseyNumber).toBe(99);
    expect(withoutJersey.jerseyNumber).toBeNull();
    expect(withJersey.overall).toBe(withoutJersey.overall);
  });

  it('응답에 산식 버전이 실린다 -- 나중에 계수를 바꿔도 조용히 바뀌지 않게', () => {
    expect(buildPlayerCard(base).formulaVersion).toBe(PLAYER_CARD_FORMULA_VERSION);
  });

  describe('카드 모양 (코스메틱 업적)', () => {
    it('처음에는 네모만 열려 있다 -- 첫 카드는 가장 단순해야 한다', () => {
      expect(unlockedCardShapes(0)).toEqual(['rect']);
      expect(unlockedCardShapes(MIN_REVIEWS_FOR_SHIELD_SHAPE - 1)).toEqual(['rect']);
    });

    it('후기 10건에서 방패가 열린다', () => {
      expect(unlockedCardShapes(MIN_REVIEWS_FOR_SHIELD_SHAPE)).toEqual(['rect', 'shield']);
      expect(unlockedCardShapes(42)).toEqual(['rect', 'shield']);
    });

    it('잠긴 모양을 저장해 뒀어도 적용되지 않는다 -- 저장값을 그대로 믿지 않는다', () => {
      // 후기가 지워져 조건이 깨지는 경우가 실제로 있다. 그때 화면만 방패로 남으면
      // "나는 되는데 남은 안 되네"가 된다.
      expect(resolveCardShape('shield', 3)).toBe('rect');
    });

    it('열려 있으면 저장한 선택을 그대로 쓴다', () => {
      expect(resolveCardShape('shield', 10)).toBe('shield');
      expect(resolveCardShape('rect', 10)).toBe('rect');
    });

    it('값이 없거나 이상하면 네모로 떨어진다', () => {
      expect(resolveCardShape(null, 99)).toBe('rect');
      expect(resolveCardShape('diamond', 99)).toBe('rect');
    });
  });
});
