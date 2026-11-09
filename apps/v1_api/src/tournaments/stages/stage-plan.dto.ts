import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested, IsUUID } from 'class-validator';
export class StageSourceDto {
  @IsString() @MaxLength(40) poolKey!: string;
  @IsInt() @Min(1) @Max(64) rank!: number;
}
export class StagePoolDto {
  @Matches(/^[a-zA-Z0-9_-]{1,40}$/) key!: string;
  @IsString() @MaxLength(60) name!: string;
  @IsIn(['league', 'knockout']) format!: 'league' | 'knockout';
  @IsInt() @Min(2) @Max(64) capacity!: number;
  @IsIn([1, 2]) legs!: 1 | 2;
  @IsArray() @ArrayMaxSize(64) @ValidateNested({ each: true }) @Type(() => StageSourceDto) sources!: StageSourceDto[];
}
export class CompetitionStageDto {
  @Matches(/^[a-zA-Z0-9_-]{1,40}$/) key!: string;
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
  @IsString() @MaxLength(40) poolKey!: string;
  @IsArray() @ArrayMinSize(2) @ArrayMaxSize(64) @IsUUID(undefined, { each: true }) registrationIds!: string[];
  @IsString() @MaxLength(64) sourceVersion!: string;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
