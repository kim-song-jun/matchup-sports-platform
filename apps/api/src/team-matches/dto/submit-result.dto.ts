import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

export class SubmitResultDto {
  @ApiProperty() scoreHome!: Record<string, unknown>;
  @ApiProperty() scoreAway!: Record<string, unknown>;
  @ApiProperty({ enum: ['win', 'draw', 'lose'] }) @IsEnum(['win', 'draw', 'lose']) resultHome!: 'win' | 'draw' | 'lose';
  @ApiProperty({ enum: ['win', 'draw', 'lose'] }) @IsEnum(['win', 'draw', 'lose']) resultAway!: 'win' | 'draw' | 'lose';
}
