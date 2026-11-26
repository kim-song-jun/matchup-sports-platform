import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { mockStagePlan } from './mock-stage-plan';
import { CreateMockTournamentDto } from './mock-tournament-seed.dto';
import { planCompetitionStages, validateStagePlan } from '../stages/stage-plan';

describe('단계별 목업 기본 구성', () => {
  it('목업 전용 staged 형식을 DTO에서 허용한다', () => {
    expect(validateSync(plainToInstance(CreateMockTournamentDto, { format: 'staged', teamCount: 4 }))).toEqual([]);
  });
  it.each(Array.from({ length: 31 }, (_, index) => index + 2))('%i팀을 실제 단계 계획으로 생성할 수 있다', teamCount => {
    const plan = mockStagePlan(teamCount);
    const validated = validateStagePlan(plan, teamCount);
    const graph = planCompetitionStages(plan);
    expect(graph.fixtures).toHaveLength(validated.fixtures);
    expect(plan.stages[0].pools.reduce((sum, pool) => sum + pool.capacity, 0)).toBe(teamCount);
    expect(plan.stages[0].pools.every(pool => pool.capacity >= 2 && pool.capacity <= 4)).toBe(true);
    expect(plan.stages[1].pools[0].sources).toEqual([1, 2].flatMap(rank => plan.stages[0].pools.map(pool => ({ poolKey: pool.key, rank }))));
    expect(plan.autoAdvance).toBe(false);
  });
});
