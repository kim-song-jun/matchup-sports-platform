import { IsIn, IsString, Matches } from 'class-validator';

export class PhoneIssueDto {
  @IsString()
  @Matches(/^\d{11}$/, { message: '휴대폰 번호는 숫자 11자리예요.' })
  phone!: string;

  @IsIn(['mobile', 'desktop'])
  channel!: 'mobile' | 'desktop';
}

export class PhoneVerifyDto {
  @IsString()
  @Matches(/^\d{11}$/, { message: '휴대폰 번호는 숫자 11자리예요.' })
  phone!: string;
}
