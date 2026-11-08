import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { MAX_PAGE_NUMBER } from '../../common/pagination/page-args';
import { IsSafeImageUrl } from '../../common/safe-image-url';
import { AD_LINK_MAX_LENGTH, IsSafeAdLinkUrl } from '../ad-link-url';

/** A bare date or a timestamp without an offset would be read as UTC — the client must state the offset. */
const TIMESTAMP_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const TIMESTAMP_MESSAGE = '$property must be an ISO 8601 timestamp with a UTC offset, e.g. 2026-11-10T00:00:00+09:00';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export const AD_ALT_TEXT_MAX_LENGTH = 120;
export const AD_POPUP_HEADLINE_MAX_LENGTH = 40;
export const AD_POPUP_DESCRIPTION_MAX_LENGTH = 80;

/** One channel's creative. Every field may be null while the campaign is a draft; publishing requires image, alt text, link and window. */
export class AdChannelCreativeDto {
  /** Must be the `/uploads/…` url returned by `POST /admin/content-assets`. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @IsSafeImageUrl(
    { localUploadsOnly: true },
    { message: 'imageUrl must be a /uploads/ path returned by POST /admin/content-assets' },
  )
  imageUrl?: string | null;

  /** Screen-reader description of the image. Required to publish; blank counts as empty. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(AD_ALT_TEXT_MAX_LENGTH)
  altText?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(AD_LINK_MAX_LENGTH)
  @IsSafeAdLinkUrl()
  linkUrl?: string | null;

  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(TIMESTAMP_WITH_OFFSET, { message: TIMESTAMP_MESSAGE })
  startAt?: string | null;

  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(TIMESTAMP_WITH_OFFSET, { message: TIMESTAMP_MESSAGE })
  endAt?: string | null;
}

/** A popup is a 4:3 card with text: the base creative plus a headline (required to publish) and an optional description. */
export class AdPopupCreativeDto extends AdChannelCreativeDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(AD_POPUP_HEADLINE_MAX_LENGTH)
  headline?: string | null;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(AD_POPUP_DESCRIPTION_MAX_LENGTH)
  description?: string | null;
}

/** Full replacement of the editable fields: an omitted or null channel removes that channel. */
export class SaveAdCampaignDto {
  /** Shown to users as "광고 · {advertiserName}". */
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  advertiserName!: string;

  /** Internal memo title; never sent to the public API. */
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => AdChannelCreativeDto)
  banner?: AdChannelCreativeDto | null;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => AdPopupCreativeDto)
  popup?: AdPopupCreativeDto | null;
}

export class UpdateAdCampaignDto extends SaveAdCampaignDto {
  /** The `version` the editor loaded; a different stored version means someone else saved first (409). */
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class PublishAdCampaignDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class AdminAdCampaignListQueryDto {
  @IsOptional()
  @IsIn(['draft', 'published', 'stopped'])
  status?: 'draft' | 'published' | 'stopped';

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_NUMBER)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
