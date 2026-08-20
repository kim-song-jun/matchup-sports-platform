import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

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
