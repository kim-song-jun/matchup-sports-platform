import { IsEmail, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';

export class FindAccountDto {
  @IsString()
  @Matches(/^\d{11}$/, { message: '휴대폰 번호는 숫자 11자리예요.' })
  phone!: string;

  @IsString()
  proofToken!: string;
}

export class ResetPasswordDto {
  @IsString()
  @Matches(/^\d{11}$/, { message: '휴대폰 번호는 숫자 11자리예요.' })
  phone!: string;

  @IsString()
  proofToken!: string;

  // 가입(RegisterDto)과 같은 8자 하한을 쓴다 — 재설정 경로만 느슨하면 그쪽이 약한 고리가 된다.
  @IsString()
  @MinLength(8, { message: '비밀번호는 8자 이상이에요.' })
  newPassword!: string;
}

/**
 * 이메일 경로의 요청 본문에는 **증명 토큰의 용도를 넣지 않는다.** 휴대폰 경로(PhoneVerifyDto)는
 * 호환 때문에 클라이언트가 purpose 를 고르지만, 이메일 경로는 처음부터 비밀번호 재설정 전용이라
 * 서버가 용도를 고정한다 — 요청자가 고를 수 있으면 그 자체가 넓힐 수 있는 표면이 된다.
 */
export class EmailRecoveryRequestDto {
  @IsEmail({}, { message: '이메일 형식이 올바르지 않아요.' })
  @MaxLength(254, { message: '이메일이 너무 길어요.' })
  email!: string;
}

export class EmailRecoveryConfirmDto {
  @IsEmail({}, { message: '이메일 형식이 올바르지 않아요.' })
  @MaxLength(254, { message: '이메일이 너무 길어요.' })
  email!: string;

  @IsString()
  @Length(6, 6, { message: '인증번호는 6자리예요.' })
  code!: string;
}

export class ResetPasswordByEmailDto {
  @IsEmail({}, { message: '이메일 형식이 올바르지 않아요.' })
  @MaxLength(254, { message: '이메일이 너무 길어요.' })
  email!: string;

  @IsString()
  proofToken!: string;

  @IsString()
  @MinLength(8, { message: '비밀번호는 8자 이상이에요.' })
  newPassword!: string;
}
