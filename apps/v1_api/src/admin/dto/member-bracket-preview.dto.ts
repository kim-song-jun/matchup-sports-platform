import { IsString, IsUUID, Length } from 'class-validator';

export class StartMemberBracketPreviewDto {
  @IsUUID()
  tournamentId!: string;

  @IsString()
  @Length(5, 500)
  reason!: string;
}
