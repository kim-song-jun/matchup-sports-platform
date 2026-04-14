import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

const DISPUTE_TYPES = ['no_show', 'late', 'level_mismatch', 'misconduct'] as const;

export class CreateDisputeDto {
  @ApiProperty({ description: '신고 팀 ID' })
  @IsUUID()
  reporterTeamId!: string;

  @ApiProperty({ description: '피신고 팀 ID' })
  @IsUUID()
  reportedTeamId!: string;

  @ApiProperty({ description: '팀 매치 ID' })
  @IsUUID()
  teamMatchId!: string;

  @ApiProperty({
    description: '분쟁 유형',
    enum: DISPUTE_TYPES,
  })
  @IsIn(DISPUTE_TYPES)
  type!: typeof DISPUTE_TYPES[number];

  @ApiProperty({ description: '분쟁 설명', minLength: 10, maxLength: 1000 })
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  description!: string;
}
