import { UnprocessableEntityException } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import type { BracketTemplateInput } from '../bracket-template-plan';

export const BRACKET_TEMPLATE_KINDS = ['knockout', 'group_knockout', 'league'] as const;
export type BracketTemplateKind = (typeof BRACKET_TEMPLATE_KINDS)[number];

export class FlexibleGroupDto {
  @IsString() @MaxLength(80) name!: string;
  @IsInt() @Min(2) @Max(8) capacity!: number;
  @IsInt() @Min(1) @Max(7) advanceCount!: number;
}

export class ApplyBracketTemplateDto {
  @IsOptional() @IsBoolean() sixTeamMode?: boolean;
  @IsOptional() @IsIn([2]) schemaVersion?: 2;
  @IsOptional() @IsInt() @Min(4) @Max(64) participantCount?: number;
  @IsOptional() @IsInt() @Min(0) @Max(4294967295) drawSeed?: number;
  @IsOptional() @IsIn(['random', 'seeded']) seedPolicy?: 'random' | 'seeded';
  @IsOptional() @IsArray() @ArrayMinSize(4) @ArrayMaxSize(64) @IsString({ each: true })
  registrationIds?: string[];
  @IsOptional() @IsArray() @ArrayMinSize(2) @ArrayMaxSize(16)
  @ValidateNested({ each: true }) @Type(() => FlexibleGroupDto)
  groups?: FlexibleGroupDto[];
  @IsOptional() @IsString() @MaxLength(64) previewHash?: string;
  @IsOptional() @IsString() @MaxLength(80) requestId?: string;
  @IsOptional() @IsBoolean() acknowledgeRematches?: boolean;
  @IsOptional() @IsInt() @Min(0) expectedRevision?: number;
  @IsIn(BRACKET_TEMPLATE_KINDS)
  kind!: BracketTemplateKind;

  @IsOptional() @IsIn(['cross_group_round12'])
  qualificationMode?: 'cross_group_round12';

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000)
  size?: number;

  @IsOptional() @IsBoolean()
  thirdPlace?: boolean;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000)
  groupCount?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000)
  teamsPerGroup?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000)
  advancePerGroup?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000)
  legs?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000)
  teamCount?: number;

  @IsOptional() @IsBoolean()
  replaceExisting?: boolean;
}

function required(value: number | undefined, field: string): number {
  if (value === undefined) {
    throw new UnprocessableEntityException({ code: 'BRACKET_TEMPLATE_UNSUPPORTED', message: `${field} 값을 입력해 주세요.` });
  }
  return value;
}

/** 필수 필드를 확인한다. 조별 합계와 결선 범위 등 조합 검증은 플래너에서 수행한다. */
export function toBracketTemplateInput(dto: ApplyBracketTemplateDto): BracketTemplateInput {
  if (dto.sixTeamMode && dto.schemaVersion !== 2) throw new UnprocessableEntityException({ code: 'SIX_TEAM_FORMAT_INVALID', message: '6강 결승 직행 방식은 전용 미리보기에서 생성해 주세요.' });
  if (dto.schemaVersion === 2 && dto.groups && dto.groups.length < 2) {
    throw new UnprocessableEntityException({ code: 'BRACKET_TEMPLATE_UNSUPPORTED', message: '조를 2개 이상 설정해 주세요.' });
  }
  const flexible = dto.schemaVersion === 2 ? {
    sixTeamMode: dto.sixTeamMode, schemaVersion: 2 as const, participantCount: dto.participantCount, groups: dto.groups, drawSeed: dto.drawSeed,
    seedPolicy: dto.seedPolicy, registrationIds: dto.registrationIds,
  } : {};
  switch (dto.kind) {
    case 'knockout':
      return { kind: 'knockout', size: required(dto.size, 'size'), thirdPlace: dto.thirdPlace ?? false, ...flexible };
    case 'league':
      return { kind: 'league', teamCount: required(dto.teamCount, 'teamCount'), legs: required(dto.legs, 'legs') as 1 | 2 };
    case 'group_knockout':
      return {
        kind: 'group_knockout',
        groupCount: dto.schemaVersion === 2 && dto.groups ? dto.groups.length : required(dto.groupCount, 'groupCount'),
        teamsPerGroup: dto.schemaVersion === 2 && dto.groups ? dto.groups[0].capacity : required(dto.teamsPerGroup, 'teamsPerGroup'),
        advancePerGroup: dto.schemaVersion === 2 && dto.groups ? dto.groups[0].advanceCount : required(dto.advancePerGroup, 'advancePerGroup'),
        legs: required(dto.legs, 'legs') as 1 | 2,
        thirdPlace: dto.thirdPlace ?? false,
        ...(dto.qualificationMode ? { qualificationMode: dto.qualificationMode } : {}),
        ...flexible,
      };
  }
}
