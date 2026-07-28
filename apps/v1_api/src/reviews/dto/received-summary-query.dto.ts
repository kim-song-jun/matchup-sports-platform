import { IsIn, IsOptional, Matches } from 'class-validator';

export class ReceivedSummaryQueryDto {
  @IsIn(['user', 'team'])
  targetType!: 'user' | 'team';

  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'period must be in YYYY-MM format' })
  period?: string;
}
