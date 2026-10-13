import { ConflictException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * "지금 참가 신청을 받는가" 를 **서버가 판정한다.**
 *
 * ## 판정은 마감과 첫 경기 킥오프가 한다 — `status` 가 아니다
 * 정본 §6(2026-09-04 사용자 확정): *"명시적 신청 마감(`registrationDeadlineAt`). **대진 생성은 신청
 * 상태를 건드리지 않는다.**"* 여기에 2026-10-13 사용자 확정으로 **리그의 첫 경기가 실제로 시작되면
 * (경기 상태가 LIVE·PAUSED·ENDED 가 된 경기가 하나라도 있으면) 마감이 남아 있어도 신청을 받지
 * 않는다**가 더해졌다 — 시즌이 시작된 리그는 상세 화면이 신청 대신 실시간 중계 진입을 앞세운다.
 * 기준은 예정 시각이 아니라 운영진의 실제 킥오프다(경기가 늦게 시작해도 정확하다). 어드민의 마감
 * 저장은 제한하지 않고, 마감이 첫 경기 예정 시각보다 늦으면 어드민 화면이 안내만 한다.
 *
 * 예전엔 `status === 'open'` 을 요구했는데, `generateFixtures` 가 거울 status 를
 * `in_progress` 로 옮기기 때문에 **대진이 하나라도 있는 리그는 신청을 영영 못 열었다**
 * (2026-09-04 alpha 실측: 409 `LEAGUE_NOT_DRAFT`). 그래서 **`status` 는 수명주기 표시 전용**이
 * 되고, 여기서는 되돌릴 수 없는 상태(`completed`·`cancelled`)만 배제한다. 대진을 미리 짜 둔
 * 리그도 첫 경기 전이면 계속 신청을 받는다.
 *
 * ## `null` 마감은 "안 받음" 이다
 * 정본 §6 이 그 대가를 명시한다: *"마감을 **누군가 정해야 한다** — 안 정하면(`null`) 그
 * 리그는 신청을 안 받는다."* 열렸다는 신호는 마감밖에 없다.
 *
 * ## 경계는 서버 쪽과 같아야 한다
 * 등록 서비스는 `deadline < now` 일 때만 닫는다 — **마감 시각과 같은 순간은 아직 열려
 * 있다.** 그래서 여기도 `>=` 다.
 */
export function isLeagueRegistrationOpen(
  status: string,
  registrationDeadlineAt: Date | null,
  firstMatchStarted: boolean,
  now: number = Date.now(),
): boolean {
  // 끝났거나 취소된 리그는 마감이 남아 있어도 받지 않는다 — 되돌릴 수 없는 상태다.
  if (status === 'completed' || status === 'cancelled') return false;
  if (registrationDeadlineAt === null) return false;
  if (firstMatchStarted) return false;
  return registrationDeadlineAt.getTime() >= now;
}

/** 시작된 경기로 보는 상태 — 운영진이 킥오프한 뒤의 상태들이다. 취소(`CANCELLED`)는 세지 않는다. */
export const LEAGUE_STARTED_GAME_STATES = ['LIVE', 'PAUSED', 'ENDED'] as const;

/**
 * 리그의 첫 경기가 실제로 시작됐는가 — 삭제되지 않은 대진의 경기 중 하나라도 킥오프했으면 참이다.
 * 공개 응답의 `gameState` 는 경기 공개 정책이 hidden 이면 비어 있어 화면이 이 판정을 대신할 수 없다 —
 * 그래서 서버가 계산해 응답에 싣는다.
 */
export async function hasLeagueFirstMatchStarted(
  db: Prisma.TransactionClient | PrismaService,
  leagueId: string,
): Promise<boolean> {
  const started = await db.v1Game.findFirst({
    where: { teamMatch: { leagueId, deletedAt: null }, state: { in: [...LEAGUE_STARTED_GAME_STATES] } },
    select: { id: true },
  });
  return started !== null;
}

/** 첫 경기가 시작된 리그에 신청을 열거나 받으려 할 때의 공통 거절. */
export function leagueAlreadyStartedException(): ConflictException {
  return new ConflictException({
    code: 'LEAGUE_ALREADY_STARTED',
    message: '첫 경기가 시작돼 참가 신청을 받지 않아요.',
  });
}
