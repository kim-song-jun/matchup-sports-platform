import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import { MAX_REVIEW_WINDOW_HOURS, MIN_REVIEW_WINDOW_HOURS } from '../review-deadline';

/** PATCH /admin/settings/reviews 바디. */
export class UpdateReviewPolicySettingsDto {
  @Type(() => Number)
  @IsInt({ message: '작성 가능 기간은 정수(시간)로 입력해주세요.' })
  @Min(MIN_REVIEW_WINDOW_HOURS, { message: `작성 가능 기간은 최소 ${MIN_REVIEW_WINDOW_HOURS}시간이에요.` })
  @Max(MAX_REVIEW_WINDOW_HOURS, { message: `작성 가능 기간은 최대 ${MAX_REVIEW_WINDOW_HOURS}시간(365일)이에요.` })
  reviewWindowHours!: number;
}
