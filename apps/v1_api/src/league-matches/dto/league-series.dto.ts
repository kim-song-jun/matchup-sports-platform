import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** 티어 하나의 슬롯 수를 규칙 대신 직접 지정한다. 지정한 방향만 덮어쓴다. */
export class PromotionTierOverrideDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  promote?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  relegate?: number;
}

export class PromotionRuleDto {
  @IsIn(['ratio', 'fixed'])
  mode!: 'ratio' | 'fixed';

  // 상·하한(0 초과 0.5 이하)은 여기서도 막지만, mode 와의 조합 규칙("mode=ratio 인데 ratio 가
  // 없다")은 DTO 가 볼 수 없다 — 그 판단은 validatePromotionRule() 이 유일하게 소유한다.
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Max(0.5)
  ratio?: number;

  @IsOptional()
  @IsIn(['ceil', 'floor', 'round'])
  rounding?: 'ceil' | 'floor' | 'round';

  @IsOptional()
  @IsInt()
  @Min(1)
  minSlots?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  fixedCount?: number;

  // 키가 티어 번호 문자열이라 @ValidateNested 로 타입을 못 건다 — 값 검증은
  // validatePromotionRule() 이 맡는다.
  @IsOptional()
  @IsObject()
  tierOverrides?: Record<string, PromotionTierOverrideDto>;
}

export class CreateLeagueSeriesDto {
  @IsString()
  @MaxLength(100)
  title!: string;

  @IsUUID()
  sportId!: string;

  @IsUUID()
  regionId!: string;

  /** 1~3. 팀이 모이지 않는 종목·지역은 1로 두고 단일 티어로 운영한다. */
  @IsInt()
  @Min(1)
  @Max(3)
  tierCount!: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => PromotionRuleDto)
  promotionRule?: PromotionRuleDto;
}

export class UpdateLeagueSeriesDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3)
  tierCount?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => PromotionRuleDto)
  promotionRule?: PromotionRuleDto;
}

/** 시즌 1의 티어별 팀 배정. 1시즌차 시딩은 어드민 수동이다(자동 시딩 없음). */
export class SeedSeasonTierDto {
  @IsInt()
  @Min(1)
  @Max(3)
  tier!: number;

  @IsString()
  @MaxLength(100)
  title!: string;

  @IsArray()
  @IsUUID('4', { each: true })
  teamIds!: string[];
}

export class SeedSeasonDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SeedSeasonTierDto)
  tiers!: SeedSeasonTierDto[];
}

/** 최종 승인 시 어드민이 확정한 팀별 결정 한 건. */
export class CommitPromotionEntryDto {
  @IsUUID()
  teamId!: string;

  @IsInt()
  @Min(1)
  @Max(3)
  fromTier!: number;

  @IsIn(['promoted', 'relegated', 'stayed', 'withdrawn'])
  kind!: 'promoted' | 'relegated' | 'stayed' | 'withdrawn';

  @IsOptional()
  @IsString()
  @MaxLength(200)
  overrideNote?: string;
}

export class CommitPromotionsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CommitPromotionEntryDto)
  entries!: CommitPromotionEntryDto[];

  /** 다음 시즌 리그 제목. 티어 수만큼 필요하다. */
  @IsOptional()
  @IsBoolean()
  createNextSeason?: boolean;
}
