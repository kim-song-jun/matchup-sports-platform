/** 팀 내 경기 자동 편성 — 순수 함수. 같은 입력과 seed 는 항상 같은 편성을 낸다(미리보기와 확정이 어긋나지 않게). */
export type BalanceCandidate = {
  userId: string;
  /** 종목 레벨의 sortOrder(클수록 높다). 미설정이면 null — 아는 선수들의 평균으로 본다. */
  level: number | null;
  /** 주 포지션 코드. 미설정이면 null — 포지션 균형에서 빠진다. */
  position: string | null;
};

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 실력 순으로 한 명씩 가장 알맞은 팀에 넣는다: 인원이 가장 적은 팀들 중에서(인원 차 1명 이내 보장)
 * 같은 포지션이 가장 적은 팀 → 실력 합이 가장 낮은 팀 → 번호가 빠른 팀 순으로 고른다.
 * ponytail: 탐욕 배정이라 최적해는 아니다. 인원은 항상 균형, 실력·포지션은 근사 균형. 30명 안팎 규모면 충분하다.
 */
export function balanceTeams(players: readonly BalanceCandidate[], teamCount: number, seed: number): string[][] {
  const rand = mulberry32(seed);
  const known = players.filter((p) => p.level !== null).map((p) => p.level as number);
  const fallback = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 0;
  const strength = (p: BalanceCandidate) => p.level ?? fallback;

  // 셔플로 동률의 순서를 seed 에 맡긴 뒤, 안정 정렬로 실력 내림차순을 만든다.
  const shuffled = [...players];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  shuffled.sort((a, b) => strength(b) - strength(a));

  const sides = Array.from({ length: teamCount }, () => ({ ids: [] as string[], power: 0, positions: new Map<string, number>() }));
  for (const player of shuffled) {
    const fewest = Math.min(...sides.map((side) => side.ids.length));
    const pool = sides.map((side, index) => ({ side, index })).filter(({ side }) => side.ids.length === fewest);
    const samePosition = ({ side }: { side: (typeof sides)[number] }) => (player.position ? side.positions.get(player.position) ?? 0 : 0);
    pool.sort((a, b) => samePosition(a) - samePosition(b) || a.side.power - b.side.power || a.index - b.index);
    const { side } = pool[0];
    side.ids.push(player.userId);
    side.power += strength(player);
    if (player.position) side.positions.set(player.position, (side.positions.get(player.position) ?? 0) + 1);
  }
  return sides.map((side) => side.ids);
}
