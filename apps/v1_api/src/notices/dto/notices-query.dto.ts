import { IsIn, IsOptional } from 'class-validator';

export const V1_NOTICE_CATEGORIES = ['업데이트', '안내'] as const;

export type V1NoticeCategory = (typeof V1_NOTICE_CATEGORIES)[number];

export class NoticesQueryDto {
  @IsOptional()
  @IsIn(V1_NOTICE_CATEGORIES)
  category?: V1NoticeCategory;
}
