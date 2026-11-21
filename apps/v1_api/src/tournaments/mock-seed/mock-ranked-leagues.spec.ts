import { mockRankedLeaguePlan } from './mock-ranked-leagues';
import { planCompetitionStages, validateStagePlan } from '../stages/stage-plan';
import { CreateMockTournamentDto } from './mock-tournament-seed.dto';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

describe('ranked league mock category', () => {
  it('accepts the new category through the request DTO', () => {
    expect(validateSync(plainToInstance(CreateMockTournamentDto, { format: 'ranked_leagues', teamCount: 20, status: 'completed' }))).toEqual([]);
  });
  it('generates five four-team preliminary pools and four five-team rank leagues with 70 unique fixtures', () => {
    const plan = mockRankedLeaguePlan(20);expect(validateStagePlan(plan,20).fixtures).toBe(70);
    expect(plan.stages[0].pools.map(p=>p.capacity)).toEqual([4,4,4,4,4]);expect(plan.stages[1].pools.map(p=>p.capacity)).toEqual([5,5,5,5]);
    const graph=planCompetitionStages(plan);expect(graph.fixtures).toHaveLength(70);
    expect(new Set(graph.fixtures.map(f=>[f.homeSlotKey,f.awaySlotKey].sort().join('|'))).size).toBe(70);
    plan.stages[1].pools.forEach((p,i)=>{expect(p.sources.map(s=>s.rank)).toEqual([i+1,i+1,i+1,i+1,i+1]);expect(p.overallRankStart).toBe(i*5+1);});
  });
  it.each([4,7,10,21,36])('rejects unsupported team count %i before seeding', count=>expect(()=>mockRankedLeaguePlan(count)).toThrow());
  it.each([8,12,16,24,28,32])('keeps the team count control useful for %i teams', count=>expect(()=>validateStagePlan(mockRankedLeaguePlan(count),count)).not.toThrow());
});
