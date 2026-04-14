import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { IsQuarterScoreMap, QuarterScoreMap } from './quarter-score.dto';

export class SubmitResultDto {
  @ApiProperty({
    description: 'Home team quarter scores: { Q1: number, Q2: number, ... }',
    example: { Q1: 2, Q2: 1 },
  })
  @IsQuarterScoreMap()
  scoreHome!: QuarterScoreMap;

  @ApiProperty({
    description: 'Away team quarter scores: { Q1: number, Q2: number, ... }',
    example: { Q1: 0, Q2: 3 },
  })
  @IsQuarterScoreMap()
  scoreAway!: QuarterScoreMap;

  @ApiProperty({ enum: ['win', 'draw', 'lose'] })
  @IsIn(['win', 'draw', 'lose'])
  resultHome!: 'win' | 'draw' | 'lose';

  @ApiProperty({ enum: ['win', 'draw', 'lose'] })
  @IsIn(['win', 'draw', 'lose'])
  resultAway!: 'win' | 'draw' | 'lose';
}
