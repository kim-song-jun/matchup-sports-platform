import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * 경기 후기(V1PostEventReview) 숨김 사유.
 *
 * 대회 후기의 HideTournamentReviewDto 와 같은 모양이다 — 두 도메인의 숨김이 같은 운영 행위라
 * 어드민이 보는 폼도 같아야 한다.
 */
export class HidePostEventReviewDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
