import { Prisma, V1GameState, V1TeamMatchStatus, V1TournamentRegistrationStatus, V1TournamentStatus } from '@prisma/client';

type Db = Prisma.TransactionClient;

/** 해체한 팀을 팀장이 직접 되돌릴 수 있는 기간. 그 뒤는 운영팀이 어드민 "팀 상태 변경"으로 복구한다. */
export const TEAM_RESTORE_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export function restoreDeadlineOf(dissolvedAt: Date): Date {
  return new Date(dissolvedAt.getTime() + TEAM_RESTORE_WINDOW_DAYS * DAY_MS);
}

/** 경계 시각(정확히 30일째)까지 포함한다. 해체 시각이 없는 보관 팀은 어드민이 보관한 옛 행이라 셀프 복구 대상이 아니다. */
export function isWithinRestoreWindow(dissolvedAt: Date | null, now: Date): boolean {
  if (dissolvedAt === null) return false;
  return now.getTime() <= restoreDeadlineOf(dissolvedAt).getTime();
}

/** 팀 상세·해체한 팀 목록이 함께 쓰는 해체 정보. 복구 가능 여부는 팀장에게만 참이다. */
export function buildDissolutionInfo(dissolvedAt: Date | null, viewerIsOwner: boolean, now: Date) {
  return {
    dissolvedAt,
    restoreDeadlineAt: dissolvedAt === null ? null : restoreDeadlineOf(dissolvedAt),
    canRestore: viewerIsOwner && isWithinRestoreWindow(dissolvedAt, now),
  };
}

const LIVE_GAME_STATES: V1GameState[] = ['LIVE', 'PAUSED'];
const OPEN_TEAM_MATCH_STATUSES: V1TeamMatchStatus[] = ['recruiting', 'closed', 'matched'];
const ENDED_COMPETITION_STATUSES: V1TournamentStatus[] = ['completed', 'cancelled'];
/** draft 는 아직 보내지 않은 신청이라 해체를 막지 않는다(보관 팀은 제출할 수도 없다). */
const INACTIVE_REGISTRATION_STATUSES: V1TournamentRegistrationStatus[] = ['draft', 'cancelled'];

export type DissolutionBlockerKind = 'live_game' | 'matched_team_match' | 'league_entry' | 'tournament_entry';

export type DissolutionBlockerItem = {
  id: string;
  title: string;
  opponentName: string | null;
  startAt: Date | null;
  placeName: string | null;
  /** 대회·리그 참가 신청 상태. 경기 항목에는 없다. */
  registrationStatus: V1TournamentRegistrationStatus | null;
  /** 정리하러 갈 화면. 대진 행이 없는 옛 대회 경기처럼 갈 곳이 없으면 null. */
  route: string | null;
};

export type DissolutionBlocker = { kind: DissolutionBlockerKind; items: DissolutionBlockerItem[] };

export type TeamMatchCandidate = {
  id: string;
  title: string;
  status: V1TeamMatchStatus;
  startAt: Date | null;
  placeName: string | null;
  hostTeamId: string | null;
  approvedApplicantTeamId: string | null;
  leagueId: string | null;
  tournamentId: string | null;
  platformManaged: boolean;
  hostTeam: { name: string } | null;
  approvedApplicantTeam: { name: string } | null;
};

export type TeamMatchDisposition = 'matched_blocker' | 'auto_cancel' | 'untouched';

/**
 * 팀매치 한 건을 해체가 어떻게 다루는지 가른다. 상대가 정해진 친선 경기는 상대 팀과
 * 조율할 일이라 막고, 상대가 없는 모집 중 경기는 서버가 취소한다. 대회·리그 대진은
 * 팀이 취소할 수 없으므로(LEAGUE_FIXTURE_HOST_CANCEL_FORBIDDEN) 여기서 건드리지 않고
 * 참가 신청 쪽 차단이 맡는다. 지난 모집 경기는 이미 만료라 그대로 둔다.
 */
export function classifyTeamMatch(match: TeamMatchCandidate, teamId: string, now: Date): TeamMatchDisposition {
  if (match.leagueId !== null || match.tournamentId !== null) return 'untouched';
  if (match.status === 'matched') return 'matched_blocker';
  const hostedByTeam = match.hostTeamId === teamId && !match.platformManaged;
  const upcoming = match.startAt === null || match.startAt.getTime() > now.getTime();
  if ((match.status === 'recruiting' || match.status === 'closed') && hostedByTeam && upcoming) return 'auto_cancel';
  return 'untouched';
}

export type CompetitionEntryCandidate = {
  id: string;
  status: V1TournamentRegistrationStatus;
  tournament: {
    id: string;
    title: string;
    kind: 'regular_tournament' | 'regular_league' | null;
    status: V1TournamentStatus;
    deletedAt: Date | null;
  };
};

/** 끝나지 않은 대회·리그에 취소되지 않은 신청이 남아 있으면 해체를 막는다. */
export function isOpenCompetitionEntry(entry: CompetitionEntryCandidate): boolean {
  if (INACTIVE_REGISTRATION_STATUSES.includes(entry.status)) return false;
  if (entry.tournament.deletedAt !== null) return false;
  return !ENDED_COMPETITION_STATUSES.includes(entry.tournament.status);
}

function teamMatchRoute(match: { id: string; tournamentId: string | null }) {
  return match.tournamentId ? `/tournaments/${match.tournamentId}/matches/${match.id}` : `/team-matches/${match.id}`;
}

export async function loadTeamMatchCandidates(db: Db, teamId: string): Promise<TeamMatchCandidate[]> {
  return db.v1TeamMatch.findMany({
    where: {
      deletedAt: null,
      status: { in: OPEN_TEAM_MATCH_STATUSES },
      OR: [{ hostTeamId: teamId }, { approvedApplicantTeamId: teamId }],
    },
    select: {
      id: true,
      title: true,
      status: true,
      startAt: true,
      placeName: true,
      hostTeamId: true,
      approvedApplicantTeamId: true,
      leagueId: true,
      tournamentId: true,
      platformManaged: true,
      hostTeam: { select: { name: true } },
      approvedApplicantTeam: { select: { name: true } },
    },
    orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
  });
}

/** 해체를 막는 조건 전부. 비어 있으면 해체할 수 있다. */
export async function findDissolutionBlockers(db: Db, teamId: string, now: Date): Promise<DissolutionBlocker[]> {
  const [liveGames, matchCandidates, entries] = await Promise.all([
    db.v1Game.findMany({
      where: { state: { in: LIVE_GAME_STATES }, sides: { some: { teamId } } },
      select: {
        id: true,
        sides: { select: { teamId: true, displayNameSnapshot: true } },
        teamMatch: { select: { id: true, title: true, startAt: true, placeName: true, tournamentId: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    loadTeamMatchCandidates(db, teamId),
    db.v1TournamentRegistration.findMany({
      where: { teamId, status: { notIn: INACTIVE_REGISTRATION_STATUSES } },
      select: {
        id: true,
        status: true,
        tournament: { select: { id: true, title: true, kind: true, status: true, deletedAt: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  const liveTeamMatchIds = new Set(liveGames.flatMap((game) => (game.teamMatch ? [game.teamMatch.id] : [])));
  const liveItems: DissolutionBlockerItem[] = liveGames.map((game) => ({
    id: game.id,
    title: game.teamMatch?.title ?? '진행 중인 경기',
    opponentName: game.sides.find((side) => side.teamId !== teamId)?.displayNameSnapshot ?? null,
    startAt: game.teamMatch?.startAt ?? null,
    placeName: game.teamMatch?.placeName ?? null,
    registrationStatus: null,
    route: game.teamMatch ? teamMatchRoute(game.teamMatch) : null,
  }));
  const matchedItems: DissolutionBlockerItem[] = matchCandidates
    .filter((match) => !liveTeamMatchIds.has(match.id) && classifyTeamMatch(match, teamId, now) === 'matched_blocker')
    .map((match) => ({
      id: match.id,
      title: match.title,
      opponentName: (match.hostTeamId === teamId ? match.approvedApplicantTeam?.name : match.hostTeam?.name) ?? null,
      startAt: match.startAt,
      placeName: match.placeName,
      registrationStatus: null,
      route: teamMatchRoute(match),
    }));
  const openEntries = entries.filter(isOpenCompetitionEntry);
  const entryItem = (entry: CompetitionEntryCandidate): DissolutionBlockerItem => ({
    id: entry.id,
    title: entry.tournament.title,
    opponentName: null,
    startAt: null,
    placeName: null,
    registrationStatus: entry.status,
    route: `/tournaments/${entry.tournament.id}/my`,
  });

  const blockers: DissolutionBlocker[] = [
    { kind: 'live_game', items: liveItems },
    { kind: 'matched_team_match', items: matchedItems },
    { kind: 'league_entry', items: openEntries.filter((e) => e.tournament.kind === 'regular_league').map(entryItem) },
    { kind: 'tournament_entry', items: openEntries.filter((e) => e.tournament.kind !== 'regular_league').map(entryItem) },
  ];
  return blockers.filter((blocker) => blocker.items.length > 0);
}
