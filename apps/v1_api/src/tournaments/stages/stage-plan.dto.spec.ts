import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { StagePlanDto } from './stage-plan.dto';
describe('stage plan nested DTO', () => {
  const config = () => ({ version: 1, stages: [{ key: 'main', name: '본선', pools: [{ key: 'league', name: '본선리그', format: 'league', capacity: 5, legs: 1, sources: [] }] }] });
  it('본선만 있는 구조를 검증하고 알 수 없는 내부 필드를 거부한다', async () => {
    expect(await validate(plainToInstance(StagePlanDto, config()), { whitelist: true, forbidNonWhitelisted: true })).toHaveLength(0);
    const invalid = config(); Object.assign(invalid.stages[0].pools[0], { registrationIds: ['another-tournament-team'] });
    expect(await validate(plainToInstance(StagePlanDto, invalid), { whitelist: true, forbidNonWhitelisted: true })).not.toHaveLength(0);
  });
  it('문자열 팀 수·없는 경기 방식·과도한 단계 수를 거부한다', async () => {
    const invalid = config(); Object.assign(invalid.stages[0].pools[0], { capacity: 'five', format: 'unsupported' });
    expect(await validate(plainToInstance(StagePlanDto, invalid), { whitelist: true, forbidNonWhitelisted: true })).not.toHaveLength(0);
    const huge = config(); huge.stages = Array(9).fill(huge.stages[0]); expect(await validate(plainToInstance(StagePlanDto, huge))).not.toHaveLength(0);
  });
});
