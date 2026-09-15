import { IsOptional, Matches } from 'class-validator';

/**
 * 공개 팀 후기 요약 쿼리. `ReceivedSummaryQueryDto` 를 재사용하지 않는 이유는 그쪽이
 * `targetType` 을 **필수**로 받기 때문이다 — 이 라우트는 경로 자체가 팀을 가리키므로
 * 호출부에 `?targetType=team` 을 강요하면 의미 없는 필수 파라미터가 된다.
 */
export class PublicTeamReviewsQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'period must be in YYYY-MM format' })
  period?: string;
}
