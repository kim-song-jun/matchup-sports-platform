import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class GameLineupParticipantDto {
  @IsOptional()
  @IsUUID()
  participantId?: string;

  @IsString()
  @IsNotEmpty()
  displayNameSnapshot!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(999)
  jerseyNumber?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  position?: string;

  // 피치 배치 좌표 — 0(자기 진영 골라인)~100(하프라인) 퍼센트. 둘 다 있거나 둘 다 없어야
  // 한다: 한쪽만 오면 렌더링이 조용히 깨지므로 ValidateIf로 짝을 강제한다.
  @ValidateIf((o) => o.positionY !== undefined)
  @Type(() => Number)
  @Min(0)
  @Max(100)
  positionX?: number;

  @ValidateIf((o) => o.positionX !== undefined)
  @Type(() => Number)
  @Min(0)
  @Max(100)
  positionY?: number;

  @IsBoolean()
  started!: boolean;
}

export class SaveGameLineupDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @IsString()
  @IsNotEmpty()
  clientCommandId!: string;

  @IsOptional()
  @IsString()
  formation?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GameLineupParticipantDto)
  participants!: GameLineupParticipantDto[];
}

export class SubmitGameLineupDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @IsString()
  @IsNotEmpty()
  clientCommandId!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  takeoverToken?: string;
}
