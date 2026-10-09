// apps/v1_api/src/tournaments/slots/dto/fill-from-standings.dto.spec.ts
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';
import { FillFromStandingsDto } from './fill-from-standings.dto';

const UUID_A = '8b000000-0000-4000-8000-000000000001';
const UUID_B = '8b000000-0000-4000-8000-000000000002';
const OPTIONS = { whitelist: true, forbidNonWhitelisted: true } as const;

const paths = (errors: ValidationError[], prefix = ''): string[] =>
  errors.flatMap((error) => {
    const here = prefix === '' ? error.property : `${prefix}.${error.property}`;
    return [here, ...paths(error.children ?? [], here)];
  });
const check = (plain: unknown) => validate(plainToInstance(FillFromStandingsDto, plain), OPTIONS);

describe('FillFromStandingsDto', () => {
  it('overrides 는 생략·빈 배열·유효한 항목을 받는다', async () => {
    expect(await check({})).toHaveLength(0);
    expect(await check({ overrides: [] })).toHaveLength(0);
    expect(await check({ overrides: [{ slotId: UUID_A, registrationId: UUID_B }] })).toHaveLength(0);
  });

  it('16개까지 받고 17개부터 거절한다 (결선 크기 상한, 16강 포함)', async () => {
    const item = { slotId: UUID_A, registrationId: UUID_B };
    expect(await check({ overrides: Array.from({ length: 16 }, () => item) })).toHaveLength(0);
    expect(paths(await check({ overrides: Array.from({ length: 17 }, () => item) }))).toContain('overrides');
  });

  it.each([
    ['uuid 가 아닌 slotId', { overrides: [{ slotId: 'not-a-uuid', registrationId: UUID_B }] }, 'overrides.0.slotId'],
    ['uuid 가 아닌 registrationId', { overrides: [{ slotId: UUID_A, registrationId: 'x' }] }, 'overrides.0.registrationId'],
    ['registrationId 누락', { overrides: [{ slotId: UUID_A }] }, 'overrides.0.registrationId'],
    ['항목 안의 모르는 필드', { overrides: [{ slotId: UUID_A, registrationId: UUID_B, force: true }] }, 'overrides.0.force'],
    ['배열이 아닌 overrides', { overrides: 'x' }, 'overrides'],
    ['본문의 모르는 필드', { overrides: [], dryRun: true }, 'dryRun'],
  ])('%s 는 거절한다', async (_name, plain, expectedPath) => {
    expect(paths(await check(plain))).toContain(expectedPath);
  });
});
