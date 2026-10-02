import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateAdminTeamMatchRecruitmentDto } from './admin-team-match-recruitment.dto';
import { MutateTeamMatchDto } from './mutate-team-match.dto';

async function genderRuleErrors(cls: new () => object, genderRule: unknown) {
  const errors = await validate(plainToInstance(cls, { genderRule }), { skipMissingProperties: true });
  return errors.filter((error) => error.property === 'genderRule');
}

describe.each([
  ['MutateTeamMatchDto', MutateTeamMatchDto],
  ['CreateAdminTeamMatchRecruitmentDto', CreateAdminTeamMatchRecruitmentDto],
])('%s genderRule 계약', (_name, cls) => {
  it.each(['성별 무관', '남', '여', null])('정본 값 %s 은 통과한다', async (value) => {
    expect(await genderRuleErrors(cls, value)).toHaveLength(0);
  });

  it.each(['any', '무관', '남녀 혼성', '', 'ANY'])('비정규 값 %j 은 거부한다', async (value) => {
    expect(await genderRuleErrors(cls, value)).toHaveLength(1);
  });
});
