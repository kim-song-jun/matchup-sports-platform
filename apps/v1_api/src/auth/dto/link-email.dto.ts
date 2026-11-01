import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { IsAccountPassword, IsSameAs } from './account-password.decorator';

export class LinkEmailRequestDto {
  @IsEmail({}, { message: '이메일 형식이 올바르지 않아요.' })
  @MaxLength(254, { message: '이메일이 너무 길어요.' })
  email!: string;
}

export class LinkEmailVerifyDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: '인증번호는 숫자 6자리예요.' })
  code!: string;
}

export class LinkEmailCompleteDto {
  /** The `emailLinkToken` of `link/email/verify`. */
  @IsString()
  @MinLength(20)
  @MaxLength(2048)
  emailLinkToken!: string;

  @IsAccountPassword()
  password!: string;

  @IsSameAs('password', { message: '비밀번호가 서로 달라요.' })
  passwordConfirm!: string;
}
