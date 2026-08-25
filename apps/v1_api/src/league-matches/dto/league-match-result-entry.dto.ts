import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * 운영자 입력·정정에 선택적으로 싣는 선수별 득점·도움. `participantId`는 이 대진의
 * Game 에 이미 존재하는 `V1GameParticipant`(대진 생성 시 양 팀 전체 active 멤버로
 * 자동 생성됨 — league-match-admin.service.ts 생성 루프)를 가리킨다. 사이드는
 * 클라이언트가 보내지 않는다 — 서버가 participant 행에서 도출해 홈/원정 뒤바뀜을
 * 원천 차단한다(league-result-participants.ts).
 */
export class LeagueResultParticipantStatDto {
  @IsUUID()
  participantId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(99)
  goals!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(99)
  assists?: number;
}

/**
 * D1-a: 운영자가 리그 대진 결과를 입력하거나(아직 결과 없음) 이미 OFFICIAL 인 결과를
 * 정정할 때 쓰는 입력. 신규 입력(`POST .../result`)과 정정(`POST .../result/correct`)
 * 두 경로가 완전히 같은 모양을 쓴다.
 *
 * **참가자별 득점·도움은 선택 입력이다**(2026-08-25 사용자 확정 — 운영자 입력 체제에서
 * 리그 개인 기록 공급 경로가 없던 갭의 해소). 비우면 기존과 동일하게 스코어만 확정하고,
 * 실으면 서비스가 검증(이 게임 소속·중복·사이드별 득점 합 ≤ 스코어) 후
 * `actualParticipants`로 변환한다. 이벤트는 계속 싣지 않는다 —
 * `validateGameResultInvariants`의 TEAM_MATCH 무이벤트 면제(Task 17 Option A)가
 * "제출된 스코어·참가자 합계가 권위"임을 보장한다. 카드·출전시간 등 나머지 스탯은
 * 여전히 받지 않는다(운영자 조작의 범위를 득점·도움 순위 공급으로 한정).
 *
 * `reason`은 필수다(league-match-forfeit.dto.ts와 같은 정책) -- 이미 확정된 결과를
 * 운영자가 직접 입력·정정하는 것은 되돌리기 어려운 조작이라 감사 로그에 사유를 남긴다.
 */
export class RecordLeagueResultDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  homeScore!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  awayScore!: number;

  /** 감사 로그·결과 리비전에 남기는 처리 사유. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;

  /** 선수별 득점·도움 (선택). 한 대진 양 팀 로스터 합보다 넉넉한 60명 상한. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => LeagueResultParticipantStatDto)
  participants?: LeagueResultParticipantStatDto[];
}
