import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  Equals,
  IsArray,
  IsDefined,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  Validate,
  ValidateIf,
  ValidateNested,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

const PLAIN_TEXT = /^(?=[\s\S]*\S)(?![\s\S]*(?:javascript\s*:|(?:alert|eval|fetch|Function|setTimeout|setInterval)\s*\(|(?:document|window)\s*\.|on[a-z]+\s*=|(?:^|[;\s])(?:color|background(?:-color)?|font(?:-size|-family|-weight)?|display|position|margin|padding|width|height|border|transform|animation|opacity)\s*:))[^<>{}]*$/iu;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SAFE_MEDIA_SEGMENT = /^[\p{L}\p{N}._-]+$/u;
const UNSAFE_URL_CHARACTERS = /[\\'"<>{}\u0000-\u001f\u007f]/u;
const ENCODED_CSS_BREAKOUT = /%(?:22|27|5c)/iu;

@ValidatorConstraint({ name: 'isTournamentCampaignImageUrl', async: false })
class TournamentCampaignImageUrlConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string' || UNSAFE_URL_CHARACTERS.test(value)) return false;
    if (value.startsWith('/uploads/')) {
      const segments = value.slice('/uploads/'.length).split('/');
      return (
        segments.length > 0 &&
        segments.every(
          (segment) => segment !== '.' && segment !== '..' && SAFE_MEDIA_SEGMENT.test(segment),
        )
      );
    }
    if (ENCODED_CSS_BREAKOUT.test(value)) return false;

    try {
      const url = new URL(value);
      return (
        url.protocol === 'https:' &&
        !url.username &&
        !url.password &&
        !isPrivateHostname(url.hostname)
      );
    } catch {
      return false;
    }
  }

  defaultMessage(): string {
    return 'imageUrl must be an HTTPS URL or a local /uploads/ path';
  }
}

function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/gu, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host === '::1') return true;
  if (/^(?:0|10|127|169\.254|192\.168)\./u.test(host)) return true;
  const private172 = /^172\.(\d{1,2})\./u.exec(host);
  if (private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31) return true;
  return /^(?:fc|fd|fe8|fe9|fea|feb)[0-9a-f:]*$/u.test(host);
}

export const TOURNAMENT_CAMPAIGN_STATUSES = ['draft', 'published', 'archived'] as const;
export type TournamentCampaignStatus = (typeof TOURNAMENT_CAMPAIGN_STATUSES)[number];

export class ListTournamentCampaignsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  readonly cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  readonly limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  readonly sportCode?: string;
}

export class TournamentCampaignHeroDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Matches(PLAIN_TEXT)
  readonly title!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  @Matches(PLAIN_TEXT)
  readonly summary?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @Validate(TournamentCampaignImageUrlConstraint)
  readonly imageUrl?: string;
}

export class TournamentCampaignIntroDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Matches(PLAIN_TEXT)
  readonly title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(3000)
  @Matches(PLAIN_TEXT)
  readonly body!: string;
}

export class TournamentCampaignHighlightDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(PLAIN_TEXT)
  readonly title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  @Matches(PLAIN_TEXT)
  readonly body!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @Validate(TournamentCampaignImageUrlConstraint)
  readonly imageUrl?: string;
}

export class TournamentCampaignFaqDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(PLAIN_TEXT)
  readonly question!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  @Matches(PLAIN_TEXT)
  readonly answer!: string;
}

export class TournamentCampaignContentDto {
  @IsInt()
  @Equals(1)
  readonly version!: 1;

  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => TournamentCampaignHeroDto)
  readonly hero!: TournamentCampaignHeroDto;

  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => TournamentCampaignIntroDto)
  readonly intro!: TournamentCampaignIntroDto;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Matches(PLAIN_TEXT)
  readonly highlightsSectionTitle!: string;

  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => TournamentCampaignHighlightDto)
  readonly highlights!: readonly TournamentCampaignHighlightDto[];

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Matches(PLAIN_TEXT)
  readonly faqSectionTitle!: string;

  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => TournamentCampaignFaqDto)
  readonly faq!: readonly TournamentCampaignFaqDto[];
}

export class CreateTournamentCampaignDto {
  @IsString()
  @MinLength(3)
  @MaxLength(80)
  @Matches(SLUG)
  readonly slug!: string;

  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => TournamentCampaignContentDto)
  readonly content!: TournamentCampaignContentDto;
}

export class UpdateTournamentCampaignDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(3)
  @MaxLength(80)
  @Matches(SLUG)
  readonly slug?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsObject()
  @ValidateNested()
  @Type(() => TournamentCampaignContentDto)
  readonly content?: TournamentCampaignContentDto;
}

export class ChangeTournamentCampaignStatusDto {
  @IsIn(TOURNAMENT_CAMPAIGN_STATUSES)
  readonly status!: TournamentCampaignStatus;

  @IsDefined()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  @Matches(PLAIN_TEXT)
  readonly reason!: string;
}
