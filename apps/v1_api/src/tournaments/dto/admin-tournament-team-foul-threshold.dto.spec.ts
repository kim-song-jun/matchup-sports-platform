import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateTournamentDto, UpdateTournamentDto } from './admin-tournament.dto';

const errorsOn = async (dto: object, property: string) =>
  (await validate(dto as never)).filter((error) => error.property === property);

describe.each([
  ['CreateTournamentDto', CreateTournamentDto],
  ['UpdateTournamentDto', UpdateTournamentDto],
] as const)('%s teamFoulThreshold', (_name, Dto) => {
  // 두 DTO 를 한 번에 돌리는 `describe.each` 라 생성자 타입이 유니온이 된다 — `plainToInstance` 오버로드가
  // 유니온을 못 고르므로 공통 생성자 타입으로 좁혀 쓴다.
  const toDto = (plain: object) => plainToInstance(Dto as new () => object, plain);
  const make = (teamFoulThreshold: unknown) => toDto({ teamFoulThreshold });

  it.each([1, 5, 7, 20])('accepts an integer %p within 1..20', async (value) => {
    expect(await errorsOn(make(value), 'teamFoulThreshold')).toHaveLength(0);
  });

  it('accepts omission (default 5) and explicit null (reset to default)', async () => {
    expect(await errorsOn(toDto({}), 'teamFoulThreshold')).toHaveLength(0);
    expect(await errorsOn(make(null), 'teamFoulThreshold')).toHaveLength(0);
  });

  it.each([0, -1, 21, 100, 2.5, '5', true])('rejects %p', async (value) => {
    expect((await errorsOn(make(value), 'teamFoulThreshold')).length).toBeGreaterThan(0);
  });
});

describe.each([
  ['CreateTournamentDto', CreateTournamentDto],
  ['UpdateTournamentDto', UpdateTournamentDto],
] as const)('%s showTeamFouls', (_name, Dto) => {
  const toDto = (plain: object) => plainToInstance(Dto as new () => object, plain);

  it.each([true, false])('accepts the boolean %p', async (value) => {
    expect(await errorsOn(toDto({ showTeamFouls: value }), 'showTeamFouls')).toHaveLength(0);
  });

  it('accepts omission (create = on, update = keep)', async () => {
    expect(await errorsOn(toDto({}), 'showTeamFouls')).toHaveLength(0);
  });

  it.each([null, 'false', 0, 1, 'on'])('rejects the non-boolean %p', async (value) => {
    expect((await errorsOn(toDto({ showTeamFouls: value }), 'showTeamFouls')).length).toBeGreaterThan(0);
  });
});
