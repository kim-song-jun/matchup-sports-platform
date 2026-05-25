import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class MatchesQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  query?: string;

  @IsOptional()
  @IsUUID()
  sportId?: string;

  @IsOptional()
  @IsUUID()
  regionId?: string;

  @IsOptional()
  @IsIn(['성별 무관', '남', '여', '무관'])
  genderRule?: '성별 무관' | '남' | '여' | '무관';

  @IsOptional()
  @IsIn(['recruiting', 'closed', 'completed', 'cancelled', 'expired'])
  status?: 'recruiting' | 'closed' | 'completed' | 'cancelled' | 'expired';

  @IsOptional()
  @IsIn(['recommended', 'latest', 'starts_at', 'deadline'])
  sort?: 'recommended' | 'latest' | 'starts_at' | 'deadline';

  @IsOptional()
  @IsIn(['card', 'compact'])
  view?: 'card' | 'compact';
}

export class MyMatchesQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @IsIn(['joined', 'created'])
  mode?: 'joined' | 'created';
}
