import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ApplyBracketTemplateDto, toBracketTemplateInput } from './bracket-template.dto';

// main.ts 전역 파이프와 같은 옵션.
const pipe = new ValidationPipe({
  whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true },
});
const run = (body: Record<string, unknown>) => pipe.transform(body, { type: 'body', metatype: ApplyBracketTemplateDto });
const codeOf = (fn: () => unknown) => {
  try { fn(); } catch (e) { return (e as { response?: { code?: string } }).response?.code; }
  return undefined;
};

describe('ApplyBracketTemplateDto', () => {
  it('토너먼트 본문을 입력으로 바꾼다 — thirdPlace 생략은 false', async () => {
    expect(toBracketTemplateInput(await run({ kind: 'knockout', size: 8, thirdPlace: true }))).toEqual({ kind: 'knockout', size: 8, thirdPlace: true });
    expect(toBracketTemplateInput(await run({ kind: 'knockout', size: 16, thirdPlace: true }))).toEqual({ kind: 'knockout', size: 16, thirdPlace: true });
    expect(toBracketTemplateInput(await run({ kind: 'knockout', size: 4 }))).toEqual({ kind: 'knockout', size: 4, thirdPlace: false });
  });

  it('리그·조별+결선 본문을 입력으로 바꾼다', async () => {
    expect(toBracketTemplateInput(await run({ kind: 'league', teamCount: 6, legs: 2 }))).toEqual({ kind: 'league', teamCount: 6, legs: 2 });
    expect(
      toBracketTemplateInput(await run({ kind: 'group_knockout', groupCount: 2, teamsPerGroup: 4, advancePerGroup: 2, legs: 1, thirdPlace: true })),
    ).toEqual({ kind: 'group_knockout', groupCount: 2, teamsPerGroup: 4, advancePerGroup: 2, legs: 1, thirdPlace: true });
  });

  it('replaceExisting 은 입력(계획)이 아니라 DTO 에만 남는다', async () => {
    const dto = await run({ kind: 'league', teamCount: 4, legs: 1, replaceExisting: true });
    expect(dto.replaceExisting).toBe(true);
    expect(toBracketTemplateInput(dto)).not.toHaveProperty('replaceExisting');
  });

  it.each([
    ['알 수 없는 필드', { kind: 'knockout', size: 8, extra: 1 }],
    ['알 수 없는 kind', { kind: 'round_robin' }],
    ['숫자가 아닌 size', { kind: 'knockout', size: 'abc' }],
    ['kind 누락', { size: 8 }],
  ])('400 으로 거부한다 — %s', async (_label, body) => {
    await expect(run(body)).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    ['토너먼트 size 누락', { kind: 'knockout' }],
    ['리그 teamCount 누락', { kind: 'league', legs: 1 }],
    ['리그 legs 누락', { kind: 'league', teamCount: 4 }],
    ['조별+결선 advancePerGroup 누락', { kind: 'group_knockout', groupCount: 2, teamsPerGroup: 4, legs: 1 }],
  ])('kind 별 필수 필드 누락은 422 BRACKET_TEMPLATE_UNSUPPORTED — %s', async (_label, body) => {
    const dto = await run(body);
    expect(codeOf(() => toBracketTemplateInput(dto))).toBe('BRACKET_TEMPLATE_UNSUPPORTED');
  });
});
