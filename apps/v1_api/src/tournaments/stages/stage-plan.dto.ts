import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested, IsUUID, ValidateIf } from 'class-validator';
export const STAGE_KEY_PATTERN = /^[a-zA-Z0-9_-]{1,40}$/;
const STAGE_KEY_MESSAGE = '키는 영문·숫자·밑줄·하이픈으로 1~40자까지 입력해 주세요.';
export class StageSourceDto {
  @Matches(STAGE_KEY_PATTERN, { message: STAGE_KEY_MESSAGE }) poolKey!: string;
  @IsInt() @Min(1) @Max(64) rank!: number;
}
export class StagePoolDto {
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
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(8) @ValidateNested({ each: true }) @Type(() => CompetitionStageDto) stages!: CompetitionStageDto[];
}
export class StageVersionDto {
  @IsInt() @Min(0) expectedRevision!: number;
}
export class StageAssignDto extends StageVersionDto {
  @IsOptional() @IsBoolean() acknowledgeStartedCorrection?: boolean;
  @Matches(STAGE_KEY_PATTERN, { message: STAGE_KEY_MESSAGE }) poolKey!: string;
  @IsArray() @ArrayMinSize(2) @ArrayMaxSize(64) @IsUUID(undefined, { each: true }) registrationIds!: string[];
  @IsString() @MaxLength(64) sourceVersion!: string;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
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
