import { IsString, Length, Matches } from 'class-validator';

export class LoginStepUpResendDto {
  @IsString()
  @Length(20, 128)
  challengeToken!: string;
}

export class LoginStepUpVerifyDto extends LoginStepUpResendDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code!: string;
}
