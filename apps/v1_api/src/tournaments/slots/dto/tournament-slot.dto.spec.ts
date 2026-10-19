import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { AssignSlotDto, SetByeSideDto } from './tournament-slot.dto';

describe('부전승 위치 DTO', () => {
  it.each([{ side: 'LEFT', expectedSide: 'HOME' }, { side: 'AWAY' }, { side: 'HOME', expectedSide: 'AWAY', fixtureId: 'other' }])('잘못된 값과 임의 필드를 거절한다', async (body) => {
    await expect(pipe.transform(body, { type: 'body', metatype: SetByeSideDto })).rejects.toBeInstanceOf(BadRequestException);
  });
});

const pipe = new ValidationPipe({
  whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true },
});
const run = (body: Record<string, unknown>) => pipe.transform(body, { type: 'body', metatype: AssignSlotDto });
const UUID = '5b0f3a6e-3c7e-4b57-9c1e-7c1f4f0a9a11';

describe('AssignSlotDto', () => {
  it('uuid 와 null(비우기)을 받는다', async () => {
    await expect(run({ registrationId: UUID })).resolves.toMatchObject({ registrationId: UUID });
    await expect(run({ registrationId: null })).resolves.toMatchObject({ registrationId: null });
  });

  it.each([
    ['키 누락(비우기는 null 을 명시해야 한다)', {}],
    ['uuid 가 아닌 문자열', { registrationId: 'abc' }],
    ['알 수 없는 필드', { registrationId: UUID, kind: 'BYE' }],
  ])('400 으로 거부한다 — %s', async (_label, body) => {
    await expect(run(body)).rejects.toBeInstanceOf(BadRequestException);
  });
});
