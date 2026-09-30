import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class DissolveTeamDto {
  /** 팀 이름을 그대로 입력해야 해체된다(앞뒤 공백만 무시). 팀 이름 최대 길이와 같다. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  confirmTeamName!: string;
}
