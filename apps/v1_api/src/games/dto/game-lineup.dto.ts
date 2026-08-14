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

  /**
   * 이 참가자가 가리키는 사용자. 대회 경기 라인업은 참가 등록 명단에서만 만들어지므로
   * 화면이 등록 명단의 userId를 그대로 실어 보낸다 — 다시 열 때 이름이 아니라 이 값으로
   * 대조해야 동명이인이 섞이지 않는다. optional인 이유는 이 필드가 없던 시절의 클라이언트와
   * 사용자 계정을 쓰지 않는 team-match 경로를 그대로 받아야 하기 때문이다.
   *
   * 값이 실리면 서비스 계층(games.service.ts#saveLineup)이 이 사이드 팀의 active 멤버인지
   * 검증한 뒤 같은 트랜잭션에서 신원 연결(identity link, action ROSTER_ASSERTED)을 자동
   * 생성한다 — GET /users/:id/records가 항상 0건이던 문제(연결을 만드는 제품 경로 부재)를
   * 이 저장 경로에서 메운다.
   */
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
