import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { findTournamentOnSurface } from '../tournaments/tournament-surface-lookup';

async function loadLeagueStatusInTx(tx: Prisma.TransactionClient, leagueId: string): Promise<string> {
  const league = await findTournamentOnSurface(tx, ['regular_league'], {
    where: { id: leagueId, deletedAt: null },
    select: { status: true },
  });
  if (league === null) {
    throw new NotFoundException({ code: 'LEAGUE_NOT_FOUND', message: '리그를 찾을 수 없어요.' });
  }
  return league.status;
}

function throwIfLeagueEnded(status: string): void {
  if (status === 'completed' || status === 'cancelled') {
    throw new ConflictException({ code: 'LEAGUE_ENDED', message: '끝났거나 취소된 리그는 대진을 만들거나 바꿀 수 없어요.' });
  }
}

/**
 * 끝남·취소만 막는다. 보류(on_hold) 중에도 운영자가 경기를 손으로 더하고 고치는 것은 허용해야 하는
 * 경로(수동 추가·수정)용이다 — 보류까지 막는 일괄 생성 가드와 섞어 쓰지 않는다.
 */
export async function assertLeagueNotEndedInTx(tx: Prisma.TransactionClient, leagueId: string): Promise<void> {
  throwIfLeagueEnded(await loadLeagueStatusInTx(tx, leagueId));
}

/** Judges against the latest state after the canonical row lock — a hold can commit after the plan is computed. */
export async function assertLeagueFixtureGenerationAllowedInTx(
  tx: Prisma.TransactionClient,
  leagueId: string,
): Promise<void> {
  const status = await loadLeagueStatusInTx(tx, leagueId);
  if (status === 'on_hold') {
    throw new ConflictException({ code: 'LEAGUE_ON_HOLD', message: '보류 중에는 대진을 만들거나 다시 만들 수 없어요. 먼저 보류를 해제해 주세요.' });
  }
  throwIfLeagueEnded(status);
}

/**
 * 리그 행을 기다리지 않고 잠근다. 이 시스템엔 리그 → 경기(일괄 생성·재생성·팀 제외·템플릿 교체)와 경기 → 리그
 * (결과 확정·취소의 완료 처리) 두 잠금 순서가 함께 있어, 경기 쪽을 쥔 채 리그 행을 기다리면 어느 쪽과든 교착한다.
 * 잡지 못하면 재시도 가능한 409 로 끝낸다(결과 투영 worker 는 이 오류를 다시 시도한다). 같은 트랜잭션이 이미 쥔
 * 잠금과는 충돌하지 않는다.
 */
async function lockLeagueRowWithoutWaitingInTx(
  tx: Prisma.TransactionClient,
  leagueId: string,
  mode: 'share' | 'update',
): Promise<void> {
  try {
    if (mode === 'share') {
      await tx.$queryRaw`SELECT id FROM "v1_tournaments" WHERE id = ${leagueId} FOR SHARE NOWAIT`;
    } else {
      await tx.$queryRaw`SELECT id FROM "v1_tournaments" WHERE id = ${leagueId} FOR UPDATE NOWAIT`;
    }
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2010' && error.meta?.code === '55P03') {
      throw new ConflictException({
        code: 'COMMAND_CONCURRENCY_CONFLICT',
        message: '리그에서 다른 작업이 진행 중이에요. 잠시 후 다시 시도해 주세요.',
      });
    }
    throw error;
  }
}

/** 리그 완료 처리용 — 리그 행을 기다리지 않고 FOR UPDATE 로 잡는다(이유는 lockLeagueRowWithoutWaitingInTx). */
export async function lockLeagueRowForCompletionInTx(tx: Prisma.TransactionClient, leagueId: string): Promise<void> {
  await lockLeagueRowWithoutWaitingInTx(tx, leagueId, 'update');
}

/**
 * 리그 행을 기다리지 않는 공유 잠금으로 잡은 뒤 끝남·취소를 다시 본다(리그 경기 수정용). 공유 잠금은 커밋까지
 * 리그 완료 갱신을 막아 검사와 앞선 쓰기가 한 덩어리가 된다.
 */
export async function assertLeagueNotEndedUnderShareLockInTx(tx: Prisma.TransactionClient, leagueId: string): Promise<void> {
  await lockLeagueRowWithoutWaitingInTx(tx, leagueId, 'share');
  throwIfLeagueEnded(await loadLeagueStatusInTx(tx, leagueId));
}
