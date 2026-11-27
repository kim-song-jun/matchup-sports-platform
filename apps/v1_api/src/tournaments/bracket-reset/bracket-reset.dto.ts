import { Equals, IsBoolean, IsString, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

export class ResetTournamentBracketDto {
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  expectedSnapshot!: string;

  @Transform(({ obj, key }) => obj[key])
  @IsBoolean()
  @Equals(true)
  confirmed!: boolean;
}
