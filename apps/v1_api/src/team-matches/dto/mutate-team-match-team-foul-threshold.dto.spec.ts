import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MutateTeamMatchDto, UpdateTeamMatchDto } from './mutate-team-match.dto';

const errorsOn = async (dto: object) =>
  (await validate(dto as never, { skipMissingProperties: false })).filter((error) => error.property === 'teamFoulThreshold');

// 친선 팀 매치의 팀 파울 경고 기준 — 대회·리그와 같은 범위(1~20)이고 생략·null 은 기본값(5개)이다.
describe.each([
  ['MutateTeamMatchDto', MutateTeamMatchDto],
  ['UpdateTeamMatchDto', UpdateTeamMatchDto],
] as const)('%s teamFoulThreshold', (_name, Dto) => {
  const make = (teamFoulThreshold: unknown) => plainToInstance(Dto as new () => object, { teamFoulThreshold });

  it.each([1, 5, 7, 20])('accepts an integer %p within 1..20', async (value) => {
    expect(await errorsOn(make(value))).toHaveLength(0);
  });

  it('accepts omission (default 5) and explicit null (reset to default)', async () => {
    expect(await errorsOn(plainToInstance(Dto as new () => object, {}))).toHaveLength(0);
    expect(await errorsOn(make(null))).toHaveLength(0);
  });

  it.each([0, -1, 21, 2.5, '5', true])('rejects %p', async (value) => {
    expect((await errorsOn(make(value))).length).toBeGreaterThan(0);
  });
});
