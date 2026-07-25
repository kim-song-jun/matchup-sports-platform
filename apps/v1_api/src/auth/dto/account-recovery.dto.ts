import { IsString, Matches, MinLength } from 'class-validator';

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
