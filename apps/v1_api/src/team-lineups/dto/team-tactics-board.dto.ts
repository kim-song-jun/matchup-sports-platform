import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
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

/**
 * 전술보드 엔트리 — 사람을 가리키는 방식이 `TeamLineupPresetEntryDto`와 **의도적으로
 * 같다**(userId nullable + displayName 스냅샷). 프리셋(팀 템플릿)과 보드(그 경기의 배치)
 * 사이에서 값을 옮길 때 변환이 필요 없어야 하기 때문이다.
 */
export class TeamTacticsBoardEntryDto {
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

  /** 피치 좌표 0~100(%). 둘 다 주거나 둘 다 비운다 — 서비스 계층이 검증한다. */
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

export class SaveTeamTacticsBoardDto {
  /** 포메이션 프리셋 라벨(예: "4-4-2"). 비우면 자유 배치. */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  formation?: string;

  /**
   * 낙관적 잠금. 화면이 마지막으로 읽은 `version`을 그대로 돌려주면, 그 사이 다른
   * 운영진이 저장한 경우 덮어쓰지 않고 409로 막는다. 보내지 않으면 검사하지 않는다
   * (스크립트·초기 저장처럼 읽은 적 없는 호출을 막지 않기 위해서다).
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  expectedVersion?: number;

  /**
   * 엔트리 전체 교체 — 부분 병합을 하지 않는다. 화면이 엔트리 식별자를 들고 있지 않아
   * "내가 방금 옮긴 것"과 "원래 있던 것"을 안전하게 합칠 방법이 없다(프리셋과 같은 이유).
   * 빈 배열은 "배치를 비운다"는 뜻으로 허용한다 — 보드는 기록이 아니라 작업 중인 판이라
   * 지우는 것도 정상 동작이다.
   */
  @IsArray()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => TeamTacticsBoardEntryDto)
  entries!: TeamTacticsBoardEntryDto[];
}
