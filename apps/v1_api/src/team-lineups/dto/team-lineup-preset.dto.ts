import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class TeamLineupPresetEntryDto {
  /** 연동 팀원이면 그 사용자 id. 게스트는 비운다. */
  @IsOptional()
  @IsString()
  userId?: string;

  @IsString()
  @MaxLength(50)
  displayName!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999)
  jerseyNumber?: number;

  /** 포지션 코드(DF/MF/FW 등). 골키퍼는 이 필드가 아니라 goalkeeper 플래그로 표시한다. */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  position?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  positionX?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  positionY?: number;

  @IsBoolean()
  started!: boolean;

  @IsOptional()
  @IsBoolean()
  goalkeeper?: boolean;
}

export class CreateTeamLineupPresetDto {
  @IsString()
  @MaxLength(30)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  formation?: string;

  /** 저장 당시 종목 이름. 다른 종목 화면에서 불러올 때 경고 배지를 붙이는 표시용이다. */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  sportName?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => TeamLineupPresetEntryDto)
  entries!: TeamLineupPresetEntryDto[];
}

export class UpdateTeamLineupPresetDto {
  @IsOptional()
  @IsString()
  @MaxLength(30)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  formation?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  sportName?: string;

  /** 주면 엔트리를 통째로 갈아끼운다(부분 병합 없음) — 화면이 엔트리 식별자를 들고
   * 있지 않아 "내가 방금 바꾼 것"과 "원래 있던 것"을 안전하게 합칠 방법이 없다. */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => TeamLineupPresetEntryDto)
  entries?: TeamLineupPresetEntryDto[];
}
