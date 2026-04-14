import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class CreateReviewDto {
  @ApiProperty({ description: 'Match ID the review belongs to' })
  @IsUUID()
  matchId!: string;

  @ApiProperty({ description: 'Target user ID being reviewed' })
  @IsUUID()
  targetId!: string;

  @ApiProperty({ description: 'Skill rating (1-5)', minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  skillRating!: number;

  @ApiProperty({ description: 'Manner rating (1-5)', minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  mannerRating!: number;

  @ApiPropertyOptional({ description: 'Optional comment' })
  @IsString()
  @IsOptional()
  comment?: string;
}
