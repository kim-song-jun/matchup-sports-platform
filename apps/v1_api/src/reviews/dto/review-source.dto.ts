import { IsIn, IsUUID } from 'class-validator';

export class ReviewSourceParamsDto {
  @IsIn(['match', 'team_match', 'tournament_fixture', 'platform_team_match'])
  sourceType!: 'match' | 'team_match' | 'tournament_fixture' | 'platform_team_match';

  @IsUUID()
  sourceId!: string;
}
