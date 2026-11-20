import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsDefined, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateNested, ValidateBy, isUUID, ValidateIf } from 'class-validator';
import type { SixTeamDirectFinalCriterion } from '../competition-config/tournament-tie-break-presets';
export const STAGE_KEY_PATTERN = /^[a-zA-Z0-9_-]{1,40}$/;
const STAGE_KEY_MESSAGE = '키는 영문·숫자·밑줄·하이픈으로 1~40자까지 입력해 주세요.';
export class StageSourceDto {
  @IsOptional() @IsArray() @ArrayMinSize(2) @ArrayMaxSize(16) @Matches(STAGE_KEY_PATTERN, { each: true }) comparisonPoolKeys?: string[];
  @IsOptional() @IsInt() @Min(1) @Max(16) comparisonPosition?: number;
  @Matches(STAGE_KEY_PATTERN, { message: STAGE_KEY_MESSAGE }) poolKey!: string;
  @IsInt() @Min(1) @Max(64) rank!: number;
}
export class StagePoolDto {
  @IsOptional() @IsBoolean() sixTeamFinalBye?: boolean;
  @IsOptional() @IsArray() @ArrayMinSize(3) @ArrayMaxSize(3) @ArrayUnique() @IsIn(['goals_for', 'goal_difference', 'fewest_goals_against'], { each: true }) sixTeamDirectFinalOrder?: SixTeamDirectFinalCriterion[];
  @IsOptional() @IsIn(['fixed', 'cross_group_top_three']) seeding?: 'fixed' | 'cross_group_top_three';
  @IsOptional() @IsBoolean() thirdPlace?: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(4096) overallRankStart?: number;
  @Matches(STAGE_KEY_PATTERN, { message: STAGE_KEY_MESSAGE }) key!: string;
  @IsString() @MaxLength(60) name!: string;
  @IsIn(['league', 'knockout']) format!: 'league' | 'knockout';
  @IsInt() @Min(2) @Max(64) capacity!: number;
  @IsIn([1, 2]) legs!: 1 | 2;
  @IsArray() @ArrayMaxSize(64) @ValidateNested({ each: true }) @Type(() => StageSourceDto) sources!: StageSourceDto[];
}
export class CompetitionStageDto {
  @Matches(STAGE_KEY_PATTERN, { message: STAGE_KEY_MESSAGE }) key!: string;
  @IsString() @MaxLength(60) name!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(16) @ValidateNested({ each: true }) @Type(() => StagePoolDto) pools!: StagePoolDto[];
}
export class StagePlanDto {
  @IsIn([1]) version!: 1;
  @IsOptional() @IsBoolean() autoAdvance?: boolean;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(8) @ValidateNested({ each: true }) @Type(() => CompetitionStageDto) stages!: CompetitionStageDto[];
}
export class StageVersionDto {
  @IsInt() @Min(0) expectedRevision!: number;
}
export class StageAutomationDto extends StageVersionDto {
  @IsBoolean() enabled!: boolean;
}
export class StageStructureDto extends StageVersionDto {
  @IsDefined() @ValidateNested() @Type(() => StagePlanDto) plan!: StagePlanDto;
  @IsString() @MaxLength(500) reason!: string;
}
export class StageFixtureRepairDto extends StageVersionDto {
  @IsUUID() fixtureId!: string;
  @IsIn(['remove', 'restore', 'replay']) action!: 'remove' | 'restore' | 'replay';
  @IsString() @MaxLength(500) reason!: string;
}
export class StageSixTeamDto extends StageVersionDto {
  @Matches(STAGE_KEY_PATTERN) poolKey!: string;
  @IsString() @MaxLength(64) sourceVersion!: string;
  @IsOptional() @IsUUID() byeRegistrationId?: string | null;
  @IsString() @MaxLength(500) reason!: string;
}
export class StageAssignDto extends StageVersionDto {
  @IsOptional() @IsBoolean() draft?: boolean;
  @IsOptional() @IsBoolean() overrideCandidates?: boolean;
  @IsOptional() @IsBoolean() acknowledgeStartedCorrection?: boolean;
  @Matches(STAGE_KEY_PATTERN, { message: STAGE_KEY_MESSAGE }) poolKey!: string;
  @IsArray() @ArrayMinSize(2) @ArrayMaxSize(64)
  @ValidateBy({ name: 'stageRegistration', validator: { validate: value => value === null || typeof value === 'string' && isUUID(value) } }, { each: true })
  registrationIds!: Array<string | null>;
  @IsString() @MaxLength(64) sourceVersion!: string;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
export class StagePoolRenameDto extends StageVersionDto {
  @Matches(STAGE_KEY_PATTERN, { message: STAGE_KEY_MESSAGE }) poolKey!: string;
  @IsString() @MaxLength(60) name!: string;
  @IsOptional() @IsString() @MaxLength(60) stageName?: string;
  @IsOptional() @IsInt() @Min(1) @Max(4096) overallRankStart?: number | null;
}
/** MD-QA #186: 단계 하나의 동점 순서. order null = 대회 설정을 따른다. 순서 칸은 서비스가 `assertValidTieBreakOrder` 로 검증한다. */
export class StageTieBreakOrderDto extends StageVersionDto {
  @ValidateIf((dto: StageTieBreakOrderDto) => dto.order !== null)
  @IsArray({ message: '동점일 때 순서는 목록이어야 해요.' })
  @ArrayMinSize(6, { message: '동점일 때 순서는 7가지 기준(예전에 저장한 6가지 순서도 받아요)이에요.' })
  @ArrayMaxSize(7, { message: '동점일 때 순서는 7가지 기준(예전에 저장한 6가지 순서도 받아요)이에요.' })
  @IsString({ each: true, message: '동점일 때 순서의 기준은 문자열이어야 해요.' })
  order!: string[] | null;
}
