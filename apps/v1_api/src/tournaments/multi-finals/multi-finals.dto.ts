import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested } from 'class-validator';

export class PreliminaryGroupDto {
  @IsString() @MaxLength(80) name!: string;
  @IsInt() @Min(2) capacity!: number;
  @IsIn([1, 2]) legs!: 1 | 2;
  @IsOptional() @IsArray() @IsUUID('4', { each: true }) registrationIds?: string[];
}
export class FinalRankRuleDto {
  @IsString() @MaxLength(100) groupId!: string;
  @IsInt() @Min(1) rank!: number;
}
export const MULTI_FINAL_POLICIES = ['rank_order', 'cross_group_top3'] as const;
export type MultiFinalPolicy = typeof MULTI_FINAL_POLICIES[number];
export class NamedFinalDto {
  @IsOptional() @IsIn(MULTI_FINAL_POLICIES) assignmentPolicy?: MultiFinalPolicy;
  @IsString() @MaxLength(80) name!: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => FinalRankRuleDto) rules!: FinalRankRuleDto[];
  @IsBoolean() thirdPlace!: boolean;
  /** null/omitted means suggestions; an empty list explicitly excludes everyone. */
  @IsOptional() @IsArray() @IsUUID('4', { each: true }) registrationIds?: string[] | null;
}
export class MultiFinalSetupDto {
  @IsInt() @Min(0) expectedRevision!: number;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => PreliminaryGroupDto) groups!: PreliminaryGroupDto[];
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => NamedFinalDto) finals!: NamedFinalDto[];
}
export class MultiFinalSelectionDto {
  @IsInt() @Min(0) expectedRevision!: number;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => NamedFinalDto) finals!: NamedFinalDto[];
}
export class MultiFinalGenerateDto {
  @IsInt() @Min(0) expectedRevision!: number;
  @IsString() @MaxLength(64) previewHash!: string;
  @IsString() @MaxLength(80) requestId!: string;
}

export class MultiFinalResetDto {
  @IsInt() @Min(0) expectedRevision!: number;
}

/** One final is committed directly; other finals and their games remain untouched. */
export class MultiFinalAssignmentPreviewDto {
  @IsInt() @Min(0) expectedRevision!: number;
  @IsString() @MaxLength(80) finalName!: string;
  @IsOptional() @IsIn(MULTI_FINAL_POLICIES) assignmentPolicy?: MultiFinalPolicy;
}
export class MultiFinalAssignmentDto extends MultiFinalAssignmentPreviewDto {
  @IsOptional() @IsString() @MaxLength(64) sourceVersion?: string;
  @IsArray() @ArrayMinSize(2) @IsUUID('4', { each: true }) registrationIds!: string[];
}
