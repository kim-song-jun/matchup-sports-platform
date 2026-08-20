import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateTeamContactDto {
  @IsUUID()
  fromTeamId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  message!: string;
}
