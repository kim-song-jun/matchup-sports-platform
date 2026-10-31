import { IsString, Length } from 'class-validator';

export class WithdrawalCancelDto {
  /** `details.withdrawalCancelToken` of the ACCOUNT_WITHDRAWAL_PENDING sign-in refusal. */
  @IsString()
  @Length(20, 512)
  token!: string;
}
