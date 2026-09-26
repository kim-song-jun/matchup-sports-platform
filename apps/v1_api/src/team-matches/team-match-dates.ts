import { BadRequestException } from '@nestjs/common';

type TeamMatchDates = { startsAt: string; endsAt?: string | null; deadlineAt?: string | null };

/** Shared by team-hosted and platform recruitment. An unchanged elapsed deadline may survive an edit. */
export function validateTeamMatchDates(dto: TeamMatchDates, existingDeadlineAt?: Date | null) {
  const startsAt = new Date(dto.startsAt);
  const endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
  const deadlineAt = dto.deadlineAt ? new Date(dto.deadlineAt) : null;
  const now = new Date();
  const invalid = (field: string, message: string): never => {
    throw new BadRequestException({ code: 'VALIDATION_FAILED', message, details: { field } });
  };
  if (!Number.isFinite(startsAt.getTime()) || startsAt <= now) {
    invalid('startsAt', '경기 시작 시간은 현재보다 이후여야 해요.');
  }
  if (endsAt && (!Number.isFinite(endsAt.getTime()) || endsAt <= startsAt)) {
    invalid('endsAt', '경기 종료 시간은 시작 시간보다 이후여야 해요.');
  }
  if (deadlineAt && (
    !Number.isFinite(deadlineAt.getTime()) || deadlineAt >= startsAt ||
    (deadlineAt <= now && deadlineAt.getTime() !== existingDeadlineAt?.getTime())
  )) {
    invalid('deadlineAt', '신청 마감은 현재보다 이후이며 경기 시작 전이어야 해요.');
  }
  return { startsAt, endsAt, deadlineAt };
}

/** The application deadline closes intake, not the review of applications already received. */
export function canConfirmTeamMatch<T extends { status: string; startAt: Date | null }>(teamMatch: T): teamMatch is T & { startAt: Date } {
  return teamMatch.status === 'recruiting' && teamMatch.startAt !== null && teamMatch.startAt > new Date();
}
