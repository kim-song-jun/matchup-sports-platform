import { BadRequestException } from '@nestjs/common';
import type { StagePlanDto } from '../stages/stage-plan.dto';

/** Four-team preliminary pools feed four leagues grouped by preliminary rank. */
export function mockRankedLeaguePlan(teamCount: number): StagePlanDto {
  if (!Number.isInteger(teamCount) || teamCount < 8 || teamCount > 32 || teamCount % 4 !== 0) {
    throw new BadRequestException({ code: 'MOCK_SEED_RANKED_TEAM_COUNT', message: '순위별 결선 리그는 8~32팀 중 4의 배수로 선택해 주세요. 20팀은 예선 30경기와 결선 40경기예요.' });
  }
  const pools = Array.from({ length: teamCount / 4 }, (_, i) => ({ key: `pre-${i}`, name: `${String.fromCharCode(65 + i)}조`, format: 'league' as const, capacity: 4, legs: 1 as const, sources: [] }));
  return { version: 1, autoAdvance: false, stages: [
    { key: 'preliminary', name: '예선', pools },
    { key: 'main', name: '본선', pools: Array.from({ length: 4 }, (_, rank) => ({
      key: `main-${rank}`, name: `${rank + 1}위 리그`, format: 'league' as const, capacity: pools.length, legs: 1 as const,
      overallRankStart: rank * pools.length + 1, sources: pools.map(pool => ({ poolKey: pool.key, rank: rank + 1 })),
    })) },
  ] };
}
