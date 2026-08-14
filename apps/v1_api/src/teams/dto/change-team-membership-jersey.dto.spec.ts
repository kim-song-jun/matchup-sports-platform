import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ChangeTeamMembershipJerseyDto } from './mutate-team.dto';

function validate(payload: unknown) {
  const dto = plainToInstance(ChangeTeamMembershipJerseyDto, payload, {
    enableImplicitConversion: true,
  });
  return { dto, errors: validateSync(dto as object) };
}

/**
 * 이 DTO의 계약은 "숫자면 지정, null이면 해제, 생략은 거부"다.
 *
 * 생략을 거부하는 게 핵심이다. 예전에는 `@IsOptional`이라 생략해도 통과했는데, 그러면
 * 서비스가 Prisma update에 undefined를 실어 보내고 Prisma는 그걸 "건드리지 마"로
 * 해석한다 — 아무것도 바뀌지 않았는데 200이 나가므로, 해제한 줄 알았던 호출자가
 * 조용히 속는다.
 */
describe('ChangeTeamMembershipJerseyDto', () => {
  it('숫자 등번호를 받는다', () => {
    const { dto, errors } = validate({ jerseyNumber: 7 });

    expect(errors).toHaveLength(0);
    expect(dto.jerseyNumber).toBe(7);
  });

  it('null은 해제 의사로 받아들인다', () => {
    const { dto, errors } = validate({ jerseyNumber: null });

    expect(errors).toHaveLength(0);
    // null이 0으로 바뀌면 "해제"가 "0번 지정"이 돼버린다 — 변환이 null을 건드리지
    // 않는다는 것을 직접 확인한다.
    expect(dto.jerseyNumber).toBeNull();
  });

  it('필드를 생략하면 거부한다 — 조용히 무시되는 것보다 400이 정직하다', () => {
    const { errors } = validate({});

    expect(errors.length).toBeGreaterThan(0);
  });

  it('숫자로 온 문자열은 숫자로 받아들인다', () => {
    const { dto, errors } = validate({ jerseyNumber: '7' });

    expect(errors).toHaveLength(0);
    expect(dto.jerseyNumber).toBe(7);
  });

  it('범위를 벗어난 번호는 거부한다', () => {
    expect(validate({ jerseyNumber: 1000 }).errors.length).toBeGreaterThan(0);
    expect(validate({ jerseyNumber: -1 }).errors.length).toBeGreaterThan(0);
  });

  it('정수가 아닌 값은 거부한다', () => {
    expect(validate({ jerseyNumber: 7.5 }).errors.length).toBeGreaterThan(0);
    expect(validate({ jerseyNumber: 'seven' }).errors.length).toBeGreaterThan(0);
  });
});
