import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
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
 * `actualParticipants`로 변환한다. `V1GameEvent` 행은 계속 만들지 않는다 —
 * `validateGameResultInvariants`의 TEAM_MATCH 무이벤트 면제(Task 17 Option A)가
 * "제출된 스코어·참가자 합계가 권위"임을 보장한다. 카드·출전시간 등 나머지 스탯은
 * 여전히 받지 않는다(운영자 조작의 범위를 득점·도움 순위 공급으로 한정).
 *
 * **`started`·`goalkeeper`는 클라이언트가 보내지 않는다.** 그 둘은 팀이 작성한 라인업에서
 * 서버가 도출한다(league-result-participants.ts) — 출전·선발 여부를 결과 입력 화면이
 * 주장할 수 있게 두면 라인업과 어긋난 개인 전적이 만들어진다. 같은 이유로 **팀이 라인업을
 * 작성한 사이드는 `participants`에 없는 선수도 출전 기록으로 저장된다**(득점 0). 즉 이
 * 배열은 "누가 뛰었는가"가 아니라 "누가 득점·도움을 기록했는가"만 담는다.
 *
 * **세 가지 상태가 서로 다른 뜻이다** (정정 경로 기준):
 * | 값 | 뜻 |
 * |---|---|
 * | 미전송(`undefined`/`null`) | 직전 공식 기록을 그대로 승계 |
 * | `[]` | 이 경기의 **득점·도움을 전부 비움**(출전 기록은 라인업대로 유지) |
 * | 값이 있는 배열 | 보낸 내용으로 교체 |
 *
 * `[]`가 "이 경기 기록 전체 삭제"가 아닌 이유는 위와 같다 — 출전은 이 배열이 주장하는 값이
 * 아니라 라인업 파생값이고, 0-0 경기는 정상적인 결과이기 때문이다. 잘못 붙은 출전 기록은
 * 라인업을 고쳐서 없앤다.
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

  /**
   * 감사 L-E finding 4 수정 — **정정(`correctResult`) 경로에서만 의미가 있다.**
   * 신규 입력(`recordResult`)은 무시한다(몰수 입력은 별도의 몰수 처리 엔드포인트가
   * 전담한다). 이 정정이 확정한 결과가 몰수인지 운영자가 명시적으로 선언한다:
   *
   * | 값 | 뜻 |
   * |---|---|
   * | 미전송(`undefined`) | base(직전) 리비전의 몰수 여부를 그대로 승계 |
   * | `true` | 이 정정 결과를 몰수로 표시(순위표·상세에 "몰수" 뱃지) |
   * | `false` | 이 정정 결과에서 몰수 표식을 명시적으로 해제(오지정된 몰수를 바로잡을 때) |
   *
   * 미지정 시 승계가 기본값인 이유: 이의(dispute) 수락이 이 DTO를 재사용하는 경로
   * (`league-match-dispute.service.ts`)는 몰수 의도를 물을 화면이 없다 — 승계를
   * 기본값으로 둬야 정당한 몰수 경기의 이의를 정정으로 처리해도 표식이 사라지지 않는다.
   */
  @IsOptional()
  @IsBoolean()
  isForfeit?: boolean;

  /** 선수별 득점·도움 (선택). 한 대진 양 팀 로스터 합보다 넉넉한 60명 상한. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => LeagueResultParticipantStatDto)
  participants?: LeagueResultParticipantStatDto[];
}
