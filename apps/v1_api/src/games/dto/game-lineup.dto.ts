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

  /**
   * **더 이상 읽지 않는다** (Task 163, 정본 §3). 선발/후보 구분 자체가 없어졌다 —
   * 명단에 있으면 그 경기에 뛴 것이고 `started` 는 항상 true 다. optional 로 남겨 둔
   * 이유는 **옛 클라이언트가 보내도 400 을 내지 않기 위해서**이며, 값은 저장 경로에서
   * 무시된다.
   *
   * 프론트가 전부 갱신되고 alpha 에서 미전송이 확인되면 이 필드를 지운다.
   */
  @IsOptional()
  @IsBoolean()
  started?: boolean;
}

export class SaveGameLineupDto {
  /** Latest revision for the target side's lineup, or 0 when the side has no lineup yet. */
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
  /** Revision of the draft lineup identified by the route's lineupId. */
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

/**
 * 명단 검인(체크인) — 이 참가자가 실제로 도착했는지를 현장에서 확정한다.
 *
 * 저장/제출과 달리 `expectedVersion` 을 받지 않는다. 체크인은 킥오프 직전 여러 명을
 * 연달아 누르는 조작이고 라인업 내용을 바꾸지 않는다 — 버전 커맨드로 만들면 한 명 누를
 * 때마다 revision 이 올라 다음 사람에서 곧바로 409 가 난다(라인업 화면이 겪던 바로 그
 * 함정이다). 그래서 라인업 revision 과 완전히 분리된 단순 상태 토글로 둔다.
 */
export class SetParticipantArrivalDto {
  @IsBoolean()
  arrived!: boolean;
}
