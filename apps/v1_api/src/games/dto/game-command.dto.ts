import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export enum GameCommandName {
  start = 'start',
  pause = 'pause',
  resume = 'resume',
  end = 'end',
  /** 이슈 #375 — 현재 피리어드만 ENDED로 닫는다(구 `next_period`처럼 다음
   * 피리어드를 같은 트랜잭션에서 곧장 LIVE로 열지 않는다). 성공하면 게임은
   * HALFTIME 관측 가능 상태가 된다(`GamesService.endCurrentPeriod`). */
  end_period = 'end-period',
  /** 이슈 #375 — HALFTIME인 다음 피리어드를 LIVE로 연다
   * (`GamesService.startNextPeriod`). `end_period`와 짝을 이루는 두 번째
   * 절반이다. */
  start_period = 'start-period',
  /** 이슈 #375 — `end_period`(+ 그 뒤 `start_period`까지) 되돌리기.
   * 되돌리려는 다음 피리어드에 기록된 이벤트가 하나도 없을 때만 허용된다
   * (`GamesService.revertPeriodTransition`의 데이터 정합성 근거 참고). */
  revert_period = 'revert-period',
  /**
   * @deprecated 이슈 #375 — `end_period` + `start_period`로 대체됐다(하프타임
   * 상태를 관측할 수 없이 한 트랜잭션에서 종료+시작을 fuse하던 구 커맨드).
   *
   * 삭제하지 않고 남겨 둔 이유(배포 안전): 백엔드/프런트는 이 커맨드 enum
   * 변경을 같은 PR·같은 배포에 함께 실어 보내지만, 배포는 원자적이지
   * 않다 — 운영자의 브라우저 탭이 배포 순간 이미 열려 있었다면(진행 중인
   * 경기를 조작하던 중일 수 있다) 새로고침 전까지 구 프런트 번들이 계속
   * `next-period`를 보낸다. 이 값을 즉시 제거하면 그 요청이 400으로
   * 실패해 마침 하프타임 전환 중이던 라이브 경기 운영이 끊긴다. 그래서
   * 백엔드는 이 값을 당분간 계속 받되(`GamesService`의 처리부 — 구
   * `advancePeriod`와 완전히 동일한 fused 동작, 동작 자체는 바꾸지
   * 않는다), 새 프런트는 더 이상 이 값을 보내지 않는다(`GameCommandName`
   * 프런트 타입에서 제거됨). 제거 시점: 다음 배포 사이클에서 이 값을 쓴
   * 감사 로그(`OperationAuditWriterService`, action `GAME_NEXT_PERIOD`)가
   * 더 이상 새로 쌓이지 않는 것을 확인한 뒤 — 무기한 방치가 아니라 관측
   * 가능한 제거 조건을 두는 것이다.
   */
  next_period = 'next-period',
}

export class GameCommandDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @IsString()
  @IsNotEmpty()
  clientCommandId!: string;

  @IsString()
  @IsNotEmpty()
  takeoverToken!: string;

  @IsDateString()
  occurredAt!: string;

  @IsObject()
  payload!: Record<string, unknown>;
}

export class CancelGameDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @IsString()
  @IsNotEmpty()
  clientCommandId!: string;

  @IsString()
  @IsNotEmpty()
  reason!: string;

  @IsOptional()
  @IsString()
  takeoverToken?: string;
}
