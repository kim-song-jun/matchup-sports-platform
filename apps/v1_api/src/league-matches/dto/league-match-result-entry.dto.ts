import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, Min, MaxLength } from 'class-validator';

/**
 * D1-a: 운영자가 리그 대진 결과를 입력하거나(아직 결과 없음) 이미 OFFICIAL 인 결과를
 * 정정할 때 쓰는 입력. 신규 입력(`POST .../result`)과 정정(`POST .../result/correct`)
 * 두 경로가 완전히 같은 모양을 쓴다 -- 스코어 두 개 + 사유뿐이라 분리할 이유가 없다.
 *
 * **참가자별 스탯(득점자·카드 등)은 받지 않는다.** `GamesService.createResultRevision`/
 * `createTeamMatchResultCorrection`이 요구하는 `actualParticipants`는 이 서비스가
 * 항상 빈 배열로 채운다 -- `league-match-forfeit.service.ts`와 같은 전례
 * (`validateGameResultInvariants`는 참가자 0명을 허용한다). 운영자 입력·정정은
 * "이 대진의 최종 스코어를 확정한다"는 관리 조작이지 경기 기록 재구성이 아니라서다.
 * 개인별 득점·카드가 필요해지면 별도 화면에서 라인업/이벤트 경로로 채운다.
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
}
