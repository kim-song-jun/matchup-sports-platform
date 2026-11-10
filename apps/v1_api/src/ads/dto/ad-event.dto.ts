import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsUUID, ValidateNested } from 'class-validator';
import { AD_CHANNELS, AD_EVENT_TYPES, type AdChannel, type AdEventType } from '../ad-campaign';

export const AD_EVENT_BATCH_MAX = 20;

export class AdEventDto {
  @IsUUID()
  campaignId!: string;

  @IsIn(AD_CHANNELS)
  channel!: AdChannel;

  @IsIn(AD_EVENT_TYPES)
  type!: AdEventType;
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
