import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';
import { QuickResultDto } from './quick-result.dto';

const TRANSFORM = { enableImplicitConversion: true } as const;
const VALIDATOR = { whitelist: true, forbidNonWhitelisted: true } as const;
const COMMAND_ID = '5b3f6f2e-0000-4000-8000-00000000c001';

async function failures(plain: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(plainToInstance(QuickResultDto, plain, TRANSFORM), VALIDATOR);
  const flatten = (list: readonly ValidationError[], prefix = ''): string[] =>
    list.flatMap((error) => {
      const path = prefix === '' ? error.property : `${prefix}.${error.property}`;
      const nested = error.children === undefined ? [] : flatten(error.children, path);
      return error.constraints === undefined ? nested : [path, ...nested];
    });
  return flatten(errors);
}

const valid = { clientCommandId: COMMAND_ID, expectedVersion: 0, score: { home: 2, away: 1 } };

describe('QuickResultDto', () => {
  it('짝 증거 — 정상 본문과 승부차기 본문은 위반 0건이다', async () => {
    expect(await failures(valid)).toEqual([]);
    expect(
      await failures({ ...valid, score: { home: 1, away: 1, penalties: { home: 5, away: 4 } } }),
    ).toEqual([]);
  });

  it('clientCommandId 는 uuid 여야 한다', async () => {
    expect(await failures({ ...valid, clientCommandId: 'not-a-uuid' })).toContain('clientCommandId');
  });

  it('음수·소수 점수와 음수 expectedVersion 을 거부한다', async () => {
    expect(await failures({ ...valid, score: { home: -1, away: 0 } })).toContain('score.home');
    expect(await failures({ ...valid, score: { home: 1.5, away: 0 } })).toContain('score.home');
    expect(await failures({ ...valid, expectedVersion: -1 })).toContain('expectedVersion');
  });

  it('penalties: null 은 통과하지 않는다 — 저장되면 승격 워커가 POISONED 로 죽는다', async () => {
    const result = await failures({ ...valid, score: { home: 1, away: 1, penalties: null } });
    expect(result.some((path) => path.startsWith('score.penalties'))).toBe(true);
  });

  it('승부차기는 점수 두 개만 받는다 — 킥 수·선축·우회 표식은 여분 키로 거부한다', async () => {
    for (const extra of [{ takenHome: 5 }, { firstKickSideKey: 'HOME' }, { operatorOverride: true }]) {
      const result = await failures({
        ...valid,
        score: { home: 1, away: 1, penalties: { home: 5, away: 4, ...extra } },
      });
      expect(result.some((path) => path.startsWith('score.penalties'))).toBe(true);
    }
  });

  it('최상위 여분 키(예: 참가자 목록)는 거부한다', async () => {
    expect(await failures({ ...valid, actualParticipants: [] })).toContain('actualParticipants');
  });
});
