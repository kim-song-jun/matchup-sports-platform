import { IsIn, IsString, Length, Matches } from 'class-validator';

export class RequestPhoneVerificationDto {
  @IsString()
  @Matches(/^\d{11}$/, { message: '휴대폰 번호는 숫자 11자리예요.' })
  phone!: string;

  @IsIn(['mobile', 'desktop'])
  channel!: 'mobile' | 'desktop';
}

export class ConfirmPhoneArrivedDto {
  @IsString()
  @Matches(/^\d{11}$/, { message: '휴대폰 번호는 숫자 11자리예요.' })
  phone!: string;
}

export class ConfirmVerificationDto {
  @IsString()
  @Length(6, 6, { message: '인증번호는 6자리예요.' })
  code!: string;
}
