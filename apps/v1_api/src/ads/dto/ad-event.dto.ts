import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsUUID, ValidateNested } from 'class-validator';

export const AD_EVENT_BATCH_MAX = 20;

export class AdEventDto {
  @IsUUID()
  campaignId!: string;

  @IsIn(['banner', 'popup'])
  channel!: 'banner' | 'popup';

  @IsIn(['impression', 'click'])
  type!: 'impression' | 'click';
}

/** One entry per occurrence; the client batches what it has queued. */
export class AdEventBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(AD_EVENT_BATCH_MAX)
  @ValidateNested({ each: true })
  @Type(() => AdEventDto)
  events!: AdEventDto[];
}
