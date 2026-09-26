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
   * 낙관적 잠금에 쓸 "내가 읽은 버전". 화면이 마지막으로 읽은 `version`을 그대로 돌려주면,
   * 그 사이 다른 운영진이 저장한 경우 덮어쓰지 않고 409로 막는다.
   *
   * **이 값을 생략해도 동시 저장 보호는 꺼지지 않는다.** 저장은 언제나 트랜잭션 안에서
   * `where: { id, version }` 조건부 갱신(compare-and-swap)으로 이루어지고, 그 사이 다른
   * 트랜잭션이 버전을 올렸으면 409다. 이 필드가 optional 인 것은 "잠금을 끌 수 있다"는
   * 뜻이 아니라 **선제 검사를 건너뛴다**는 뜻이다 — 값을 주면 쓰기를 시도하기 전에
   * 어긋남을 알려주고, 안 주면 CAS 가 그 자리에서 잡는다.
   *
   * 항상 CAS 로 가는 이유: 필드 하나를 빠뜨리는 것만으로 동료의 배치가 조용히 덮어써지는
   * 구조는 옵션이 아니라 함정이다. 409를 받은 쪽은 다시 불러와 재시도하면 되지만, 사라진
   * 배치를 되살릴 방법은 없다. (같은 종류의 조용한 덮어쓰기가 라인업 동시 저장에서 이미
   * 사고로 나왔고, 그쪽은 사이드별 revision 으로 막았다.)
   *
   * 첫 저장은 보드가 없어 create 경로라 CAS 대상이 아니다 — 이때 409가 나는 경우는
   * "그 사이 다른 운영진이 먼저 만들었다" 하나뿐이다.
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
