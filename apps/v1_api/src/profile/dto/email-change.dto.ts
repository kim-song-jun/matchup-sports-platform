import { IsEmail, IsString, Matches, MaxLength } from 'class-validator';

export class EmailChangeRequestDto {
  @IsEmail({}, { message: '이메일 형식이 올바르지 않아요.' })
  @MaxLength(254, { message: '이메일이 너무 길어요.' })
  email!: string;
}

export class EmailChangeVerifyDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: '인증번호는 숫자 6자리예요.' })
  code!: string;
}
