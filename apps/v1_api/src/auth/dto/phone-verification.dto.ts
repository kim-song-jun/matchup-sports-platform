import { IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';
import type { PhoneProofPurpose } from '../../verification/phone-proof-token';

export class PhoneIssueDto {
  @IsString()
  @Matches(/^\d{11}$/, { message: '휴대폰 번호는 숫자 11자리예요.' })
  phone!: string;
}

export class PhoneVerifyDto {
  @IsString()
  @Matches(/^\d{11}$/, { message: '휴대폰 번호는 숫자 11자리예요.' })
  phone!: string;

  @IsString()
  @Length(6, 6, { message: '인증번호는 6자리예요.' })
  code!: string;

  /**
   * 발급받을 증명 토큰의 용도. 생략하면 기존 동작 그대로 가입용이다 —
   * 계정 찾기·비밀번호 재설정은 'password_reset' 을 명시해 가입용 토큰과 섞이지 않게 한다.
   */
  @IsOptional()
  @IsIn(['signup', 'password_reset'])
  purpose?: PhoneProofPurpose;
}
