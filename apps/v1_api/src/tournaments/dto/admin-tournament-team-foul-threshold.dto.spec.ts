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
  const make = (teamFoulThreshold: unknown) => plainToInstance(Dto, { teamFoulThreshold });

  it.each([1, 5, 7, 20])('accepts an integer %p within 1..20', async (value) => {
    expect(await errorsOn(make(value), 'teamFoulThreshold')).toHaveLength(0);
  });

  it('accepts omission (default 5) and explicit null (reset to default)', async () => {
    expect(await errorsOn(plainToInstance(Dto, {}), 'teamFoulThreshold')).toHaveLength(0);
    expect(await errorsOn(make(null), 'teamFoulThreshold')).toHaveLength(0);
  });

  it.each([0, -1, 21, 100, 2.5, '5', true])('rejects %p', async (value) => {
    expect((await errorsOn(make(value), 'teamFoulThreshold')).length).toBeGreaterThan(0);
  });
});
