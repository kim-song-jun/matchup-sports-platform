import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateTeamInvitationDto } from './create-team-invitation.dto';

function validate(payload: unknown) {
  const dto = plainToInstance(CreateTeamInvitationDto, payload, {
    enableImplicitConversion: true,
  });
  return { dto, errors: validateSync(dto as object) };
}

function constraintsFor(payload: unknown, field: string) {
  return validate(payload).errors.find((error) => error.property === field)?.constraints ?? {};
}

/**
 * invitedEmail 은 메일을 보내는 주소가 아니라 이미 가입한 계정을 찾는 조회 키다(없으면
 * 404). 그래서 계약은 "회원가입이 받아 주는 주소는 초대도 받아야 한다" — 가입 DTO 는
 * 형식 검사를 하지 않으므로, 초대만 엄격하면 만들 수는 있는데 초대는 못 하는 계정이 생긴다.
 */
describe('CreateTeamInvitationDto', () => {
  it('영문자가 아닌 TLD 도 받는다 — 가입이 허용한 주소를 초대가 거절하면 안 된다', () => {
    // 로컬 시드 계정(prisma/seed.ts)의 도메인. 기본 @IsEmail() 은 TLD 에 숫자가 있으면 거절한다.
    expect(validate({ invitedEmail: 'owner@teameet.v1' }).errors).toHaveLength(0);
  });

  it('평범한 주소는 그대로 통과한다', () => {
    expect(validate({ invitedEmail: 'someone@gmail.com' }).errors).toHaveLength(0);
  });

  it('@ 가 없는 문자열은 여전히 거절한다 — 검사를 지운 게 아니다', () => {
    expect(constraintsFor({ invitedEmail: 'ownerteameet' }, 'invitedEmail')).toHaveProperty('isEmail');
  });

  it('254자를 넘는 주소는 길이로 거절한다', () => {
    const address = `${'a'.repeat(64)}@${'b'.repeat(186)}.com`;
    expect(address).toHaveLength(255);

    expect(constraintsFor({ invitedEmail: address }, 'invitedEmail')).toHaveProperty('maxLength');
  });

  it('메시지는 200자까지만 받는다', () => {
    expect(
      constraintsFor({ invitedEmail: 'someone@gmail.com', message: 'ㅋ'.repeat(201) }, 'message'),
    ).toHaveProperty('maxLength');
    expect(
      validate({ invitedEmail: 'someone@gmail.com', message: 'ㅋ'.repeat(200) }).errors,
    ).toHaveLength(0);
  });
});
