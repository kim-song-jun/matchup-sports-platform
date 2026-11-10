/**
 * MD-QA #187 — 사건 시각 정정의 **쓰기** 경로. 운영 콘솔(확정 전, `GamesService.correctEventTime`)과
 * 플랫폼 어드민(확정 후, `TournamentResultReviewService.correctOfficialEventTime`)이 같은 검증과
 * 같은 행 모양을 쓰도록 한곳에 둔다. 호출자는 경기 행을 잠근 트랜잭션 안에서 부른다.
 *
 * 규칙(2026-11-10 사용자 확정):
 * - 원본 행은 고치지 않는다. 새 TIME_CORRECTION 행이 원본을 가리키고 이전/새 시각·사유·주체를 남긴다.
 * - 시각만 바꾼다. 피리어드는 원본 그대로(같은 피리어드 안에서만)이고 타입·선수·팀·점수·카드 수는 그대로다.
 * - 새 시각은 0 ~ (피리어드 설정 길이와 실제로 흐른 시간 중 큰 값) 사이다.
 */
import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import {
  Prisma,
  V1GameEventType,
  V1GameResultRevisionState,
  type V1GameEvent,
  type V1GameResultRevision,
  type V1GameState,
} from '@prisma/client';
import { parsePeriodDurations } from '../tournaments/competition-config/competition-config.parse';
import { isPeriodUnknown } from '../tournaments/tournament-fixture-official-result';
import { closeRevisionReviewSla } from '../tournament-operations/results/close-review-sla';
import {
  TIME_CORRECTABLE_EVENT_TYPES,
  applyEventTimesToRevisionSnapshot,
  eventClockUpperBoundMs,
  latestEventTimeCorrections,
  type EventTimeCorrectionPayload,
} from './core/event-time-corrections';
import { GameContractError } from './core/game-contract';
import { assertRevisionSupersession, assertRevisionTransition } from './core/revision-state-machine';

type Tx = Prisma.TransactionClient;

export type AppendEventTimeCorrectionInput = {
  gameId: string;
  eventId: string;
  clockMs: number;
  reason: string;
  lane: EventTimeCorrectionPayload['lane'];
  clientEventId: string;
  payloadHash: string;
  actorUserId: string;
  lastSequence: number;
  competitionConfigVersionId: string;
  now?: Date;
};

export type AppendedEventTimeCorrection = {
  correction: V1GameEvent;
  target: V1GameEvent;
  previousClockMs: number;
  sequence: number;
  version: number;
  state: V1GameState;
};

export async function appendEventTimeCorrection(
  tx: Tx,
  input: AppendEventTimeCorrectionInput,
): Promise<AppendedEventTimeCorrection> {
  const reason = input.reason.trim();
  if (reason.length === 0) {
    throw new UnprocessableEntityException({ code: 'EVENT_TIME_REASON_REQUIRED', message: '정정 사유를 적어 주세요.' });
  }
  const target = await tx.v1GameEvent.findFirst({ where: { id: input.eventId, gameId: input.gameId } });
  if (target === null) {
    throw new NotFoundException({ code: 'GAME_EVENT_NOT_FOUND', message: 'Game resource was not found' });
  }
  // 레거시 백필 골은 원본에 전/후반이 없어 "같은 피리어드 안" 규칙을 지킬 수 없다.
  if (!TIME_CORRECTABLE_EVENT_TYPES.has(target.type) || isPeriodUnknown(target.payload)) {
    throw new UnprocessableEntityException({
      code: 'EVENT_TIME_NOT_CORRECTABLE',
      message: '시각을 고칠 수 있는 기록이 아니에요.',
    });
  }
  const related = await tx.v1GameEvent.findMany({
    where: {
      gameId: input.gameId,
      OR: [{ reversesEventId: target.id }, { correctsEventId: target.id }],
    },
    select: { id: true, type: true, clockMs: true, sequence: true, correctsEventId: true, reversesEventId: true },
  });
  if (related.some((event) => event.reversesEventId === target.id)) {
    throw new ConflictException({
      code: 'EVENT_ALREADY_REVERSED',
      message: '취소된 기록은 시각을 고칠 수 없어요.',
    });
  }
  const previousClockMs = latestEventTimeCorrections(related).get(target.id) ?? target.clockMs;
  if (previousClockMs === input.clockMs) {
    throw new UnprocessableEntityException({
      code: 'EVENT_TIME_UNCHANGED',
      message: '지금 기록된 시각과 같아요.',
    });
  }
  const [config, period] = await Promise.all([
    tx.v1CompetitionConfigVersion.findUnique({
      where: { id: input.competitionConfigVersionId },
      select: { periods: true },
    }),
    tx.v1GamePeriod.findFirst({
      where: { gameId: input.gameId, number: target.period },
      select: { startedAt: true, endedAt: true, pausedTotalMs: true, pausedAt: true },
    }),
  ]);
  const now = input.now ?? new Date();
  const configuredMinutes = parsePeriodDurations(config?.periods)?.[target.period - 1]?.durationMinutes ?? null;
  const maxClockMs = eventClockUpperBoundMs({ configuredMinutes, period, now });
  if (input.clockMs < 0 || (maxClockMs !== null && input.clockMs > maxClockMs)) {
    throw new UnprocessableEntityException({
      code: 'EVENT_CLOCK_OUT_OF_RANGE',
      message: '이 피리어드 안의 시각으로 골라 주세요.',
      details: { period: target.period, minClockMs: 0, maxClockMs },
    });
  }
  const sequence = input.lastSequence + 1;
  const payload: EventTimeCorrectionPayload = {
    previousClockMs,
    clockMs: input.clockMs,
    reason,
    lane: input.lane,
  };
  const correction = await tx.v1GameEvent.create({
    data: {
      gameId: input.gameId,
      sequence,
      clientEventId: input.clientEventId,
      payloadHash: input.payloadHash,
      type: V1GameEventType.TIME_CORRECTION,
      // 선수·팀을 싣지 않는다 — 선수 단위로 사건을 세는 곳(출전·기록 보유 판정 등)이
      // 정정 행을 사건으로 오인하지 않게 한다. 원본은 correctsEventId 로만 찾는다.
      sideId: null,
      participantId: null,
      period: target.period,
      clockMs: input.clockMs,
      occurredAt: now,
      actorUserId: input.actorUserId,
      correctsEventId: target.id,
      payload: payload as unknown as Prisma.InputJsonValue,
    },
  });
  const updated = await tx.v1Game.update({
    where: { id: input.gameId },
    data: { lastSequence: sequence, version: { increment: 1 } },
    select: { version: true, state: true },
  });
  return { correction, target, previousClockMs, sequence, version: updated.version, state: updated.state };
}

/** 이 경기의 모든 사건 시각(정정 반영) — 리비전 스냅샷 동기화에 쓴다. */
export async function loadCorrectedEventClocks(tx: Tx, gameId: string): Promise<ReadonlyMap<string, number>> {
  const corrections = await tx.v1GameEvent.findMany({
    where: { gameId, type: V1GameEventType.TIME_CORRECTION },
    select: { id: true, type: true, clockMs: true, sequence: true, correctsEventId: true },
  });
  return latestEventTimeCorrections(corrections);
}

export type EventTimeRevisionSync = {
  revisionId: string;
  revision: number;
  revisionState: 'SUBMITTED' | 'OFFICIAL';
  supersedesRevisionId: string;
};

function toJsonInput(value: Prisma.JsonValue): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

/**
 * 결과 리비전의 골 분(`goalEvents`)·카드 분(`cards.events`) 스냅샷을 정정된 사건 시각에 맞춘다.
 * 리비전은 제출·확정 뒤 고칠 수 없으므로(DB 트리거) 같은 내용의 후속 리비전을 만들어 대체한다 —
 * 점수·선수 기록·MVP·종결 사유·eventsHash 는 그대로 승계하고 분만 바뀐다. 바뀔 분이 없으면 null.
 *
 * - base 가 SUBMITTED(확정 전, 콘솔 정정): 후속을 SUBMITTED 로 다시 제출한다(EVENT_TIME_SYNC).
 *   원래 제출 시각을 유지하고 앞 리비전의 검토 SLA 를 닫는다 — `syncAssistsIntoSubmittedRevision` 과 같은 방식.
 * - base 가 OFFICIAL(확정 후, 어드민 정정): 후속을 바로 OFFICIAL 로 세우고 공식 포인터를 옮긴다(CORRECTION).
 *   점수가 같으므로 진출·순위는 바뀌지 않는다 — `syncAdminEndedGameRoster` 와 같은 방식.
 */
export async function syncRevisionEventTimes(
  tx: Tx,
  input: {
    gameId: string;
    base: V1GameResultRevision;
    reason: string;
    createdBy: { actorType: 'USER'; userId: string } | { actorType: 'SYSTEM'; systemActor: string };
  },
): Promise<EventTimeRevisionSync | null> {
  const { base } = input;
  if (base.state !== V1GameResultRevisionState.SUBMITTED && base.state !== V1GameResultRevisionState.OFFICIAL) {
    return null;
  }
  const [clockByEventId, participants] = await Promise.all([
    loadCorrectedEventClocks(tx, input.gameId),
    tx.v1GameResultParticipant.findMany({ where: { resultRevisionId: base.id }, orderBy: { participantId: 'asc' } }),
  ]);
  const snapshot = applyEventTimesToRevisionSnapshot({
    goalEvents: base.goalEvents,
    participants: participants.map((participant) => ({ id: participant.id, cards: participant.cards })),
    clockByEventId,
  });
  if (snapshot === null) return null;
  const official = base.state === V1GameResultRevisionState.OFFICIAL;
  try {
    assertRevisionSupersession({
      baseGameId: base.gameId,
      successorGameId: input.gameId,
      baseRevisionId: base.id,
      supersedesRevisionId: base.id,
      baseState: base.state,
      successorState: V1GameResultRevisionState.DRAFT,
      purpose: official ? 'CORRECTION' : 'EVENT_TIME_SYNC',
    });
    assertRevisionTransition({
      from: V1GameResultRevisionState.DRAFT,
      to: base.state,
      flow: official ? 'CORRECTION' : 'STANDARD',
    });
  } catch (error) {
    if (error instanceof GameContractError) {
      throw new ConflictException({ code: error.code, message: error.message });
    }
    throw error;
  }
  const latest = await tx.v1GameResultRevision.findFirst({
    where: { gameId: input.gameId },
    orderBy: { revision: 'desc' },
    select: { revision: true },
  });
  const draft = await tx.v1GameResultRevision.create({
    data: {
      gameId: input.gameId,
      revision: (latest?.revision ?? base.revision) + 1,
      score: toJsonInput(base.score),
      goalEvents: snapshot.goalEvents === null ? Prisma.DbNull : toJsonInput(snapshot.goalEvents),
      eventsHash: base.eventsHash,
      missingScorer: base.missingScorer,
      mvpParticipantId: base.mvpParticipantId,
      outcomeReason: base.outcomeReason,
      outcomeNote: base.outcomeNote,
      reason: input.reason,
      createdByActorType: input.createdBy.actorType,
      createdByUserId: input.createdBy.actorType === 'USER' ? input.createdBy.userId : null,
      createdBySystemActor: input.createdBy.actorType === 'SYSTEM' ? input.createdBy.systemActor : null,
      supersedesId: base.id,
    },
  });
  // 참가자 행은 DRAFT 리비전에만 쓸 수 있다(DB 트리거) — 상태를 올리기 전에 옮긴다.
  if (participants.length > 0) {
    await tx.v1GameResultParticipant.createMany({
      data: participants.map(({ id, createdAt: _createdAt, updatedAt: _updatedAt, resultRevisionId: _revisionId, cards, ...row }) => ({
        ...row,
        resultRevisionId: draft.id,
        cards: toJsonInput(snapshot.participantCards.get(id) ?? cards),
      })),
    });
  }
  const now = new Date();
  const promoted = await tx.v1GameResultRevision.update({
    where: { id: draft.id },
    data: official
      ? { state: V1GameResultRevisionState.OFFICIAL, submittedAt: base.submittedAt ?? now, officialAt: now }
      : { state: V1GameResultRevisionState.SUBMITTED, submittedAt: base.submittedAt ?? now },
  });
  if (official) {
    await tx.v1Game.update({ where: { id: input.gameId }, data: { currentOfficialRevisionId: promoted.id } });
  } else {
    await closeRevisionReviewSla(tx, base.id, '사건 시각 정정으로 새 리비전이 제출되어 대체됨');
  }
  await tx.v1OutboxEvent.create({
    data: {
      businessKey: `game:${input.gameId}:revision:${promoted.revision}:${official ? 'event_time_officialize' : 'submitted'}`,
      aggregateType: 'GAME',
      aggregateId: input.gameId,
      revisionId: promoted.id,
      type: official ? 'GAME_RESULT_OFFICIAL' : 'GAME_RESULT_SUBMITTED',
      payload: official ? { revisionId: promoted.id } : { revisionId: promoted.id, supersedesId: base.id },
    },
  });
  return {
    revisionId: promoted.id,
    revision: promoted.revision,
    revisionState: official ? 'OFFICIAL' : 'SUBMITTED',
    supersedesRevisionId: base.id,
  };
}
