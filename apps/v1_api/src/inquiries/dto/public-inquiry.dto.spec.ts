import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreatePublicInquiryDto } from './public-inquiry.dto';

// main.ts 전역 파이프와 같은 옵션 — 암묵 변환·화이트리스트까지 실제 요청과 같게 거친다.
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

const validBody = {
  category: 'tournament_hosting',
  organization: '가상 풋살 연합',
  name: '담당자',
  email: 'host@example.test',
  message: '가을 풋살 대회를 열고 싶어요.',
  consent: true,
  website: '',
  formStartedAt: 1_700_000_000_000,
};

const run = (body: Record<string, unknown>) =>
  pipe.transform(body, { type: 'body', metatype: CreatePublicInquiryDto });

describe('CreatePublicInquiryDto via the global ValidationPipe options', () => {
  it('accepts a complete tournament-hosting inquiry and drops blank optional fields', async () => {
    const dto = await run({ ...validBody, sportType: '', expectedSchedule: '  ' });
    expect(dto).toBeInstanceOf(CreatePublicInquiryDto);
    expect(dto.sportType).toBeUndefined();
    expect(dto.expectedSchedule).toBeUndefined();
  });

  it.each([
    ['missing', undefined],
    ['false', false],
    ['the string "true"', 'true'],
    ['the string "false"', 'false'],
  ])('rejects consent that is %s', async (_label, consent) => {
    await expect(run({ ...validBody, consent })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a phone number, which the consent block does not list as collected', async () => {
    await expect(run({ ...validBody, phone: '010-0000-0000' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each(['account', 'report', 'tournament', 'other'])('rejects member-only category %s', async (category) => {
    await expect(run({ ...validBody, category })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a message over 2000 characters', async () => {
    await expect(run({ ...validBody, message: 'a'.repeat(2001) })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a sport outside soccer/futsal/other', async () => {
    await expect(run({ ...validBody, sportType: 'running' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a missing formStartedAt', async () => {
    const { formStartedAt: _omit, ...rest } = validBody;
    await expect(run(rest)).rejects.toBeInstanceOf(BadRequestException);
  });
});
