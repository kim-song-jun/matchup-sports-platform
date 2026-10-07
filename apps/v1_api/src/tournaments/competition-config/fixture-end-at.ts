import type { Prisma } from '@prisma/client';
import { regulationMinutes } from './competition-config.parse';

/** 이 경기 설정 버전의 정규 시간(연장 제외 피리어드 합계, 분 — 전·후반이면 둘의 합, 단판이면 그 한 피리어드). 설정이 없거나 길이를 모르면 null. */
export async function regulationMinutesForConfigVersion(
  tx: Prisma.TransactionClient,
  competitionConfigVersionId: string | null,
): Promise<number | null> {
  if (competitionConfigVersionId === null) return null;
  const config = await tx.v1CompetitionConfigVersion.findUnique({
    where: { id: competitionConfigVersionId },
    select: { periods: true },
  });
  return regulationMinutes(config?.periods);
}

/**
 * 종료 시각을 받지 않은 경기의 기본 종료 = 시작 + 그 경기가 쓰는 경기 설정의 정규 시간.
 * 대회·리그 대진 생성과 일정 변경이 함께 쓴다 — 종료 시각이 비면 일정·캘린더·진행 상태가
 * "언제 끝나는지 모르는 경기"가 된다. 시작 시각이 없거나 길이를 모르면 null 그대로다.
 */
export async function defaultFixtureEndAt(
  tx: Prisma.TransactionClient,
  competitionConfigVersionId: string | null,
  startAt: Date | null,
): Promise<Date | null> {
  if (startAt === null) return null;
  const minutes = await regulationMinutesForConfigVersion(tx, competitionConfigVersionId);
  return minutes === null ? null : new Date(startAt.getTime() + minutes * 60_000);
}
