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

  // 매니저가 로스터에 지정한 계정. 주어지면 서비스 계층(games.service.ts#saveLineup)이
  // 이 사이드 팀의 active 멤버인지 검증한 뒤 같은 트랜잭션에서 신원 연결(identity link,
  // action ROSTER_ASSERTED)을 자동 생성한다 -- GET /users/:id/records가 항상 0건이던
  // 문제(연결을 만드는 제품 경로 부재)를 이 저장 경로에서 메운다.
  @IsOptional()
  @IsUUID()
  userId?: string;

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
