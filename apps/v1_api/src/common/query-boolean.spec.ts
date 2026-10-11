import { BadRequestException } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { createGlobalValidationPipe } from './global-validation-pipe';
import { queryBoolean } from './query-boolean';

class ToggleQueryDto {
  @IsOptional()
  @Transform(queryBoolean)
  @IsBoolean()
  today?: boolean;
}

const pipe = createGlobalValidationPipe();
const parse = (query: Record<string, string>) =>
  pipe.transform(query, { type: 'query', metatype: ToggleQueryDto }) as Promise<ToggleQueryDto>;

describe('queryBoolean (전역 파이프 경유)', () => {
  it("'false' 는 false 로 읽는다 — 암묵 변환이 먼저 true 로 바꾸지 않는다", async () => {
    await expect(parse({ today: 'false' })).resolves.toMatchObject({ today: false });
  });

  it("'true' 는 true 로 읽는다", async () => {
    await expect(parse({ today: 'true' })).resolves.toMatchObject({ today: true });
  });

  it('그 밖의 값은 400 이다', async () => {
    await expect(parse({ today: 'yes' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('없으면 undefined 그대로다', async () => {
    const dto = await parse({});
    expect(dto.today).toBeUndefined();
  });
});
