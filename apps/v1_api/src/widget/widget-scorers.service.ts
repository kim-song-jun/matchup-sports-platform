import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { foldEventTimeCorrectionsInMatchOrder } from '../games/core/event-time-corrections';
import { loadParticipantConsentEligibility } from '../games/public-records/public-consent';
import {
  isTournamentParticipantNameGatingReverted,
  loadParticipantNameProfiles,
  resolveParticipantDisplayName,
  resolveParticipantNameEligible,
} from '../games/public-records/participant-name-gating';
import { PrismaService } from '../prisma/prisma.service';
import { isMinuteUnknown, parseTournamentFixtureRevisionGoals } from '../tournaments/tournament-fixture-official-result';

/** 위젯이 득점 띠에 한 골씩 보여 주는 값. `side` 는 우리 팀 기준이다. */
export interface WidgetScorer {
  side: 'MINE' | 'OPPONENT';
  /** 이름을 보여 줘도 되는 골만. 규칙상 가리거나 모르면 null — 받는 쪽은 「득점」만 보여 준다. */
  name: string | null;
  /** 분(`ceil(clockMs / 60000)`, 웹 경기 화면과 같은 환산). 분을 모르는 골(옛 기록)은 null. */
  minute: number | null;
  ownGoal: boolean;
}

export interface WidgetScorerGame {
  gameId: string;
  mineSideId: string;
  /** 친선 팀 매치의 공유 기록 골(`V1TeamMatchRecord.goals`). 기록이 없으면 null → 경기 이벤트에서 읽는다. */
  sharedGoals: Prisma.JsonValue | null;
  /** 공식 결과의 골 목록(옛 기록을 옮긴 경기). 없으면 null. */
  officialGoalEvents: Prisma.JsonValue | null;
  officialState: string | null;
}

interface RawGoal {
  sideId: string;
  participantId: string | null;
  playerNameSnapshot: string | null;
  ownGoal: boolean;
  minute: number | null;
}

/** 분을 모르는 골은 뒤로, 나머지는 분 순서. 같은 분이면 읽은 순서를 지킨다. */
function byMinuteUnknownLast<T extends { minute: number | null }>(rows: readonly T[]): T[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => (a.row.minute ?? Number.MAX_SAFE_INTEGER) - (b.row.minute ?? Number.MAX_SAFE_INTEGER) || a.index - b.index)
    .map(({ row }) => row);
}

/** 공유 기록의 골(JSON)을 읽는다. 읽을 수 없는 항목은 건너뛴다. */
export function readSharedGoals(value: Prisma.JsonValue | null | undefined): RawGoal[] {
  if (!Array.isArray(value)) return [];
  const goals: RawGoal[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    if (typeof row.sideId !== 'string') continue;
    goals.push({
      sideId: row.sideId,
      participantId: typeof row.participantId === 'string' ? row.participantId : null,
      playerNameSnapshot: null,
      ownGoal: row.ownGoal === true,
      minute: typeof row.minute === 'number' && Number.isFinite(row.minute) && row.minute >= 0 ? row.minute : null,
    });
  }
  return goals;
}

/**
 * 득점자 이름 규칙 — **공개 경기 화면과 같은 판정**을 그대로 쓴다(`participant-name-gating`).
 *  - 대회·리그 경기(경기 이벤트·공식 결과의 골): 공개 일정 카드와 같다. 동의 규칙이 켜져 있으면 동의한 참가자만, 이름은 닉네임 기본 + 프로필의 실명 공개 설정.
 *  - 친선 팀 매치(공유 기록): 공개 화면은 진행 중에 득점자를 보여 주지 않는다(점수만). 위젯은 **우리 팀 골만** 이름을 붙이고 상대 골은 이름 없이 준다.
 */
@Injectable()
export class WidgetScorersService {
  constructor(private readonly prisma: PrismaService) {}

  async load(games: readonly WidgetScorerGame[]): Promise<Map<string, WidgetScorer[]>> {
    const result = new Map<string, WidgetScorer[]>();
    if (games.length === 0) return result;

    const eventGames = games.filter((game) => game.sharedGoals === null);
    const eventRows = await this.eventGoals(eventGames.map((game) => game.gameId));

    const rawByGame = new Map<string, { goals: RawGoal[]; friendly: boolean }>();
    for (const game of games) {
      if (game.sharedGoals !== null) {
        rawByGame.set(game.gameId, { goals: byMinuteUnknownLast(readSharedGoals(game.sharedGoals)), friendly: true });
        continue;
      }
      // 옛 기록을 옮긴 경기는 공식 결과의 골이 곧 기록이다(경기 이벤트에는 없다).
      const revisionGoals = game.officialState === 'OFFICIAL' ? parseTournamentFixtureRevisionGoals(game.officialGoalEvents) : null;
      const goals =
        revisionGoals !== null
          ? revisionGoals.map((goal) => ({ sideId: goal.sideId, participantId: goal.participantId, playerNameSnapshot: goal.playerNameSnapshot, ownGoal: goal.ownGoal, minute: goal.minute }))
          : (eventRows.get(game.gameId) ?? []);
      rawByGame.set(game.gameId, { goals: byMinuteUnknownLast(goals), friendly: false });
    }

    const participantIds = [...new Set([...rawByGame.values()].flatMap(({ goals }) => goals.flatMap((goal) => (goal.participantId === null ? [] : [goal.participantId]))))];
    const participants =
      participantIds.length === 0
        ? []
        : await this.prisma.v1GameParticipant.findMany({ where: { id: { in: participantIds } }, select: { id: true, userId: true, displayNameSnapshot: true } });
    const participantById = new Map(participants.map((participant) => [participant.id, participant] as const));
    const consentMap = isTournamentParticipantNameGatingReverted() ? await loadParticipantConsentEligibility(this.prisma, participantIds) : new Map();
    const profiles = await loadParticipantNameProfiles(this.prisma, participants.map((participant) => participant.userId));

    for (const game of games) {
      const raw = rawByGame.get(game.gameId)!;
      result.set(
        game.gameId,
        raw.goals.map((goal) => {
          const mine = goal.sideId === game.mineSideId;
          const eligible = resolveParticipantNameEligible(false, goal.participantId === null ? undefined : consentMap.get(goal.participantId));
          const name =
            raw.friendly && !mine
              ? null
              : !eligible
                ? null
                : goal.participantId === null
                  ? goal.playerNameSnapshot
                  : resolveParticipantDisplayName(participantById.get(goal.participantId), profiles);
          return { side: mine ? ('MINE' as const) : ('OPPONENT' as const), name, minute: goal.minute, ownGoal: goal.ownGoal };
        }),
      );
    }
    return result;
  }

  /**
   * 경기 이벤트에서 골을 읽는다. 공개 일정 카드(`loadScheduleEvents`)와 같은 순서 — 전체를 읽어 정정한 시각을 접고, 취소된 골은 빼고, 그다음에 골만 남긴다.
   * (골만 쿼리로 거르면 취소 행을 못 읽어 취소된 골이 그대로 남는다.)
   */
  private async eventGoals(gameIds: string[]): Promise<Map<string, RawGoal[]>> {
    const result = new Map<string, RawGoal[]>();
    if (gameIds.length === 0) return result;
    const recorded = await this.prisma.v1GameEvent.findMany({
      where: { gameId: { in: gameIds } },
      orderBy: [{ period: 'asc' }, { clockMs: 'asc' }, { sequence: 'asc' }],
      select: { id: true, gameId: true, type: true, sideId: true, participantId: true, period: true, clockMs: true, reversesEventId: true, payload: true, sequence: true, correctsEventId: true },
    });
    const events = foldEventTimeCorrectionsInMatchOrder(recorded);
    const reversed = new Set(events.map((event) => event.reversesEventId).filter((id): id is string => id !== null));
    for (const event of events) {
      if ((event.type !== 'GOAL' && event.type !== 'OWN_GOAL') || event.sideId === null || reversed.has(event.id)) continue;
      const list = result.get(event.gameId) ?? [];
      list.push({
        sideId: event.sideId,
        participantId: event.participantId,
        playerNameSnapshot: null,
        ownGoal: event.type === 'OWN_GOAL',
        minute: isMinuteUnknown(event.payload) ? null : Math.ceil(event.clockMs / 60_000),
      });
      result.set(event.gameId, list);
    }
    return result;
  }
}
