import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class ListReviewsQueryDto {
  @IsOptional()
  @IsIn(['pending', 'written'])
  tab?: 'pending' | 'written';

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  /**
   * 진행 중 대회 상세에서 현재 사용자가 실제로 남길 수 있는 fixture 후기만 좁혀 읽는다.
   * pending 탭 전용이며, 값이 있으면 개인/팀매치 후기는 섞지 않는다.
   */
  @IsOptional()
  @IsUUID()
  tournamentId?: string;
}
