import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class SocialLinkDto {
  @IsString()
  @Matches(/^\d{11}$/, { message: '휴대폰 번호는 숫자 11자리예요.' })
  phone!: string;

  /** `POST /auth/phone/verify` (purpose=social_link) 가 준 증명 토큰. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  proofToken!: string;
}
