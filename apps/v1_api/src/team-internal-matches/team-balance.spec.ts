import { balanceTeams, type BalanceCandidate } from './team-balance';

const make = (n: number, over: (i: number) => Partial<BalanceCandidate> = () => ({})): BalanceCandidate[] =>
  Array.from({ length: n }, (_, i) => ({ userId: `u${i}`, level: null, position: null, ...over(i) }));

describe('balanceTeams', () => {
  it('같은 입력과 seed 는 항상 같은 편성이고, seed 가 다르면 달라진다', () => {
    const players = make(14, (i) => ({ level: i % 4 }));
    expect(balanceTeams(players, 2, 7)).toEqual(balanceTeams(players, 2, 7));
    expect(balanceTeams(players, 2, 7)).not.toEqual(balanceTeams(players, 2, 8));
  });

  it.each([[7, 2], [14, 3], [10, 4], [5, 2], [4, 4]])('%i명을 %i팀으로 나눠도 인원 차는 1명 이내이고 빠지거나 겹친 사람이 없다', (count, teams) => {
    const sides = balanceTeams(make(count, (i) => ({ level: (i * 7) % 5 })), teams, 1);
    const sizes = sides.map((side) => side.length);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
    expect(sides.flat().sort()).toEqual(make(count).map((p) => p.userId).sort());
  });

  it('실력이 갈린 팀원은 두 팀의 실력 합이 거의 같다', () => {
    const levels = [9, 8, 7, 6, 5, 4, 3, 2, 1, 0];
    const players = make(10, (i) => ({ level: levels[i] }));
    const [a, b] = balanceTeams(players, 2, 3).map((ids) => ids.reduce((sum, id) => sum + (levels[Number(id.slice(1))] ?? 0), 0));
    expect(Math.abs(a - b)).toBeLessThanOrEqual(1);
  });

  it('같은 포지션은 양쪽에 고르게 나뉜다', () => {
    const players = make(8, (i) => ({ level: 3, position: i < 4 ? 'FW' : 'DF' }));
    const sides = balanceTeams(players, 2, 5);
    for (const ids of sides) {
      const fw = ids.filter((id) => players.find((p) => p.userId === id)?.position === 'FW').length;
      expect(fw).toBe(2);
    }
  });

  it('레벨이 없는 선수만 있어도 인원만 균등하게 나눈다', () => {
    expect(balanceTeams(make(6), 2, 0).map((side) => side.length)).toEqual([3, 3]);
  });
});
