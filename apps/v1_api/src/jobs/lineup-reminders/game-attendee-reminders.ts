import { V1GameLineupState, type Prisma, type V1NotificationTargetType } from '@prisma/client';
import { formatKstMonthDayTime, formatKstTime } from '../../common/kst-datetime';
import { loadCompetitionRosterBase, loadGameRoster, type GameRosterPreload } from '../../games/roster/game-roster-loader';
import { notificationCopyFor } from '../../notifications/notifications.service';
import { loadTeamCompetitionGameOrder } from '../../tournaments/discipline/team-game-order';
import { isQuietHour, kstMidnight } from './quiet-hours';

type Tx = Prisma.TransactionClient;

/** 킥오프 알림은 킥오프 2시간 전 한 번이다. 스캔이 15분 주기라 30분 창이면 스캔 하나를 놓쳐도 다음 스캔이 보낸다. */
export const KICKOFF_REMINDER_LEAD_MS = 2 * 60 * 60 * 1000;
const KICKOFF_REMINDER_WINDOW_MS = 30 * 60 * 1000;

export type ReminderGameKind = 'LEAGUE' | 'TOURNAMENT' | 'FRIENDLY';

/** 경기 전 알림 한 묶음의 단위 — 경기의 한 사이드(팀). */
export interface ReminderGameSide {
  readonly teamMatchId: string;
  readonly gameId: string;
  readonly sideId: string;
  readonly teamId: string;
  readonly kind: ReminderGameKind;
  /** 리그면 leagueId, 대회면 tournamentId, 친선은 null. */
  readonly competitionId: string | null;
  readonly startAt: Date;
  readonly opponentName: string;
  readonly placeName: string | null;
}

export interface SideAudience {
  /**
   * 발송 시점의 출전자 중 지금도 그 팀 활성 멤버인 사람. `null` 이면 출전 명단이 아직 없다
   * (친선 참석명단 미제출 — 팀장·매니저는 참석명단 최종 확인 알림을 따로 받는다 — 또는 기준 명단 없음).
   */
  readonly attendeeUserIds: ReadonlySet<string> | null;
  readonly managerUserIds: ReadonlySet<string>;
}

/** `V1Notification` 한 행. businessKey 가 (경기, 수신자)당 한 번을 DB unique 로 보장한다. */
export interface ReminderRow {
  readonly userId: string;
  readonly targetType: V1NotificationTargetType;
  readonly targetId: string;
  readonly title: string;
  readonly body: string;
  readonly deepLink: string | null;
  readonly businessKey: string;
}

/**
 * `startAt` 조건에 드는 상대가 정해진 경기의 사이드들. 리그 대진은 leagueId 가 판별자다(대회 id 를 함께 가질 수 있다).
 * 호출자가 하루·30분 창으로만 부르므로 건수 상한을 두지 않는다 — 상한을 두면 초과분 경기의 알림이 조용히 빠진다.
 */
export async function loadReminderGameSides(tx: Tx, startAt: Prisma.DateTimeNullableFilter): Promise<ReminderGameSide[]> {
  const matches = await tx.v1TeamMatch.findMany({
    where: {
      status: 'matched',
      deletedAt: null,
      startAt,
      hostTeamId: { not: null },
      approvedApplicantTeamId: { not: null },
      game: { isNot: null },
    },
    select: {
      id: true,
      startAt: true,
      placeName: true,
      leagueId: true,
      tournamentId: true,
      hostTeamId: true,
      hostTeam: { select: { name: true } },
      approvedApplicantTeam: { select: { name: true } },
      game: { select: { id: true, sides: { select: { id: true, teamId: true } } } },
    },
    orderBy: { startAt: 'asc' },
  });

  const sides: ReminderGameSide[] = [];
  for (const match of matches) {
    if (match.game === null || match.startAt === null) continue;
    const kind: ReminderGameKind = match.leagueId !== null ? 'LEAGUE' : match.tournamentId !== null ? 'TOURNAMENT' : 'FRIENDLY';
    for (const side of match.game.sides) {
      if (side.teamId === null) continue;
      const opponent = side.teamId === match.hostTeamId ? match.approvedApplicantTeam : match.hostTeam;
      if (opponent === null) continue;
      sides.push({
        teamMatchId: match.id,
        gameId: match.game.id,
        sideId: side.id,
        teamId: side.teamId,
        kind,
        competitionId: match.leagueId ?? match.tournamentId,
        startAt: match.startAt,
        opponentName: opponent.name,
        placeName: match.placeName,
      });
    }
  }
  return sides;
}

/**
 * 사이드별 수신자. 출전자는 대회·리그면 계산된 경기 명단(참가 명단 − 조정 − 결장 − 출전정지),
 * 친선이면 최신 참석명단이 제출(SUBMITTED·LOCKED)된 경우의 그 명단이다 — 홈 "내 출전" 판정과 같은 정의다.
 * 팀을 나간 사람·비팀원은 명단에 남아 있어도 뺀다.
 */
export async function loadSideAudiences(
  tx: Tx,
  sides: readonly ReminderGameSide[],
): Promise<Array<{ side: ReminderGameSide; audience: SideAudience }>> {
  if (sides.length === 0) return [];

  const memberships = await tx.v1TeamMembership.findMany({
    where: { teamId: { in: [...new Set(sides.map((side) => side.teamId))] }, status: 'active' },
    select: { teamId: true, userId: true, role: true },
  });
  const friendlyAttendees = await loadFriendlyAttendees(
    tx,
    sides.filter((side) => side.kind === 'FRIENDLY').map((side) => side.sideId),
  );
  const preloaded = new Map<string, GameRosterPreload>();

  const result: Array<{ side: ReminderGameSide; audience: SideAudience }> = [];
  for (const side of sides) {
    const members = memberships.filter((membership) => membership.teamId === side.teamId);
    const memberIds = new Set(members.map((membership) => membership.userId));
    const rosterUserIds =
      side.kind === 'FRIENDLY' ? (friendlyAttendees.get(side.sideId) ?? null) : await loadCompetitionAttendees(tx, side, preloaded);
    const audience: SideAudience = {
      attendeeUserIds: rosterUserIds === null ? null : new Set(rosterUserIds.filter((userId) => memberIds.has(userId))),
      managerUserIds: new Set(
        members.filter((membership) => membership.role === 'owner' || membership.role === 'manager').map((membership) => membership.userId),
      ),
    };
    result.push({ side, audience });
  }
  return result;
}

async function loadCompetitionAttendees(
  tx: Tx,
  side: ReminderGameSide,
  preloaded: Map<string, GameRosterPreload>,
): Promise<string[] | null> {
  if (side.competitionId === null) return null;
  const cacheKey = `${side.competitionId}:${side.teamId}`;
  let cached = preloaded.get(cacheKey);
  if (cached === undefined) {
    const scope = { competitionId: side.competitionId, isLeague: side.kind === 'LEAGUE', teamId: side.teamId };
    const base = await loadCompetitionRosterBase(tx, scope);
    cached = { base, orderedGames: base === null ? [] : await loadTeamCompetitionGameOrder(tx, scope) };
    preloaded.set(cacheKey, cached);
  }
  if (cached.base === null) return null;
  const loaded = await loadGameRoster(tx, { gameId: side.gameId, sideId: side.sideId }, cached);
  return loaded === null ? null : loaded.computation.participants.map((entry) => entry.userId);
}

/** 사이드마다 최신 참석명단 한 revision 만 본다 — 제출 뒤 다시 열린 초안이 최신이면 아직 미확정이다. */
async function loadFriendlyAttendees(tx: Tx, sideIds: readonly string[]): Promise<Map<string, string[]>> {
  if (sideIds.length === 0) return new Map();
  const latest = await tx.v1GameLineup.findMany({
    where: { sideId: { in: [...sideIds] }, invalidatedAt: null },
    orderBy: [{ sideId: 'asc' }, { revision: 'desc' }],
    distinct: ['sideId'],
    select: { id: true, sideId: true, state: true },
  });
  const submitted = latest.filter((lineup) => lineup.state !== V1GameLineupState.DRAFT);
  if (submitted.length === 0) return new Map();
  const participants = await tx.v1GameParticipant.findMany({
    where: { lineupId: { in: submitted.map((lineup) => lineup.id) }, userId: { not: null } },
    select: { sideId: true, userId: true },
  });
  const bySide = new Map<string, string[]>(submitted.map((lineup) => [lineup.sideId, []]));
  for (const participant of participants) {
    if (participant.userId !== null) bySide.get(participant.sideId)?.push(participant.userId);
  }
  return bySide;
}

function reminderTarget(side: ReminderGameSide): { targetType: V1NotificationTargetType; targetId: string } {
  return side.kind === 'TOURNAMENT' && side.competitionId !== null
    ? { targetType: 'tournament', targetId: `${side.competitionId}:${side.teamMatchId}` }
    : { targetType: 'team_match', targetId: side.teamMatchId };
}

function matchup(side: ReminderGameSide): string {
  return side.placeName === null ? `vs ${side.opponentName}` : `vs ${side.opponentName} · ${side.placeName}`;
}

/**
 * 지금 킥오프 2시간 전 알림을 보낼 때인가. 2시간 전 시각이 야간(KST 21~9시)이면 보내지 않는다 —
 * 아침 첫 스캔으로 미루면 "2시간 뒤"가 틀린 말이 된다. 그 경기는 홈 카드가 대신 알린다.
 */
export function isKickoffReminderDue(startAt: Date, now: Date): boolean {
  const remaining = startAt.getTime() - now.getTime();
  if (remaining <= KICKOFF_REMINDER_LEAD_MS - KICKOFF_REMINDER_WINDOW_MS || remaining > KICKOFF_REMINDER_LEAD_MS) return false;
  return !isQuietHour(new Date(startAt.getTime() - KICKOFF_REMINDER_LEAD_MS));
}

/**
 * 킥오프 2시간 전 — 출전자와 팀장·매니저. 출전자에게만 "지금 출전 명단에 있어요."를 붙인다.
 * 두 알림 모두 제목·본문에 시각이 박히므로 멱등 키에 킥오프 시각을 넣는다 — 경기를 옮기면 새 시각으로 다시 보낸다.
 */
export function buildKickoffReminderRows(side: ReminderGameSide, audience: SideAudience): ReminderRow[] {
  const attendees = audience.attendeeUserIds;
  if (attendees === null) return [];
  const { targetType, targetId } = reminderTarget(side);
  const copy = notificationCopyFor('game_kickoff_reminder', targetType, targetId);
  const lead = `${formatKstTime(side.startAt)} ${matchup(side)}.`;
  return [...new Set([...attendees, ...audience.managerUserIds])].map((userId) => ({
    userId,
    targetType,
    targetId,
    title: copy.title,
    body: attendees.has(userId) ? `${lead} ${copy.defaultBody}` : lead,
    deepLink: copy.deepLink,
    businessKey: `game-kickoff:${side.gameId}:${side.startAt.getTime()}:${userId}`,
  }));
}

/** 경기 전날 — 출전자. 대회·리그 팀장·매니저는 같은 스캔의 "명단 확인"을 받으므로 뺀다(한 사람에게 한 건). */
export function buildDayBeforeAttendeeRows(side: ReminderGameSide, audience: SideAudience): ReminderRow[] {
  if (audience.attendeeUserIds === null) return [];
  const { targetType, targetId } = reminderTarget(side);
  const copy = notificationCopyFor('game_day_before_reminder', targetType, targetId);
  const alreadyNotified = side.kind === 'FRIENDLY' ? new Set<string>() : audience.managerUserIds;
  return [...audience.attendeeUserIds]
    .filter((userId) => !alreadyNotified.has(userId))
    .map((userId) => ({
      userId,
      targetType,
      targetId,
      title: `${formatKstMonthDayTime(side.startAt)} ${copy.title}`,
      body: `${matchup(side)}. ${copy.defaultBody}`,
      deepLink: copy.deepLink,
      businessKey: `game-day-before:${side.gameId}:${side.startAt.getTime()}:${userId}`,
    }));
}

/** 이번 스캔에서 보낼 경기 전 알림 — 내일(KST) 경기의 전날 알림과 킥오프 2시간 전 알림. */
export async function collectAttendeeReminderRows(tx: Tx, now: Date): Promise<ReminderRow[]> {
  const tomorrow = await loadReminderGameSides(tx, { gte: kstMidnight(now, 1), lt: kstMidnight(now, 2) });
  const kickoff = (
    await loadReminderGameSides(tx, {
      gt: new Date(now.getTime() + KICKOFF_REMINDER_LEAD_MS - KICKOFF_REMINDER_WINDOW_MS),
      lte: new Date(now.getTime() + KICKOFF_REMINDER_LEAD_MS),
    })
  ).filter((side) => isKickoffReminderDue(side.startAt, now));
  return [
    ...(await loadSideAudiences(tx, tomorrow)).flatMap(({ side, audience }) => buildDayBeforeAttendeeRows(side, audience)),
    ...(await loadSideAudiences(tx, kickoff)).flatMap(({ side, audience }) => buildKickoffReminderRows(side, audience)),
  ];
}
