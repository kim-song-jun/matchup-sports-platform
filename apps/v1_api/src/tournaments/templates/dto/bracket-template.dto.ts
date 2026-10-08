import { UnprocessableEntityException } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import type { BracketTemplateInput } from '../bracket-template-plan';

export const BRACKET_TEMPLATE_KINDS = ['knockout', 'group_knockout', 'league'] as const;
export type BracketTemplateKind = (typeof BRACKET_TEMPLATE_KINDS)[number];

export class ApplyBracketTemplateDto {
  @IsIn(BRACKET_TEMPLATE_KINDS)
  kind!: BracketTemplateKind;

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

/** 필수 필드 존재만 확인한다. 값의 범위(4/8/12/16강, 3~20팀 …)는 플래너가 같은 코드로 거부한다. */
export function toBracketTemplateInput(dto: ApplyBracketTemplateDto): BracketTemplateInput {
  switch (dto.kind) {
    case 'knockout':
      return { kind: 'knockout', size: required(dto.size, 'size') as 4 | 8 | 12 | 16, thirdPlace: dto.thirdPlace ?? false };
    case 'league':
      return { kind: 'league', teamCount: required(dto.teamCount, 'teamCount'), legs: required(dto.legs, 'legs') as 1 | 2 };
    case 'group_knockout':
      return {
        kind: 'group_knockout',
        groupCount: required(dto.groupCount, 'groupCount'),
        teamsPerGroup: required(dto.teamsPerGroup, 'teamsPerGroup'),
        advancePerGroup: required(dto.advancePerGroup, 'advancePerGroup') as 1 | 2,
        legs: required(dto.legs, 'legs') as 1 | 2,
        thirdPlace: dto.thirdPlace ?? false,
      };
  }
}
