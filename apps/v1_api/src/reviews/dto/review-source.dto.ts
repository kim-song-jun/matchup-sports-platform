import { IsIn, IsUUID } from 'class-validator';

export class ReviewSourceParamsDto {
  @IsIn(['match', 'team_match', 'tournament_fixture'])
  sourceType!: 'match' | 'team_match' | 'tournament_fixture';

  @IsUUID()
  sourceId!: string;
}
