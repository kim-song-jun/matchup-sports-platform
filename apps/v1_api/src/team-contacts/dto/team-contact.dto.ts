import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateTeamContactDto {
  @IsUUID()
  fromTeamId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  message!: string;
}

export class DeclineTeamContactDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

export class ListTeamContactsQueryDto {
  @IsOptional()
  @IsIn(['inbound', 'outbound'])
  direction?: 'inbound' | 'outbound';

  @IsOptional()
  @IsIn(['requested', 'accepted', 'declined', 'withdrawn', 'expired'])
  status?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
