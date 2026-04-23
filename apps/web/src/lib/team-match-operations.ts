import type {
  MyTeam,
  SportTeam,
  TeamMatch,
  TeamMatchArrivalCheck,
  TeamMatchEvaluation,
  TeamMatchOutcome,
  TeamMatchQuarterScoreMap,
} from '@/types/api';

export interface TeamMatchParticipant {
  id: string;
  name: string;
  isHost: boolean;
  logoUrl?: string;
  team: SportTeam;
}

export const TEAM_MATCH_HISTORY_STATUS_FILTER = [
  'recruiting',
  'scheduled',
  'checking_in',
  'in_progress',
  'completed',
  'cancelled',
  'late',
  'no_show',
  'disputed',
].join(',');

const TEAM_MATCH_STATUS_META: Record<string, { label: string; className: string }> = {
  recruiting: { label: '모집중', className: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-200' },
  scheduled: { label: '경기예정', className: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300' },
  checking_in: { label: '도착확인중', className: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300' },
  in_progress: { label: '경기중', className: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  completed: { label: '경기종료', className: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-200' },
  cancelled: { label: '취소', className: 'bg-red-50 text-red-500 dark:bg-red-900/30 dark:text-red-400' },
  late: { label: '지각', className: 'bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-300' },
  no_show: { label: '노쇼', className: 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300' },
  disputed: { label: '분쟁중', className: 'bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-300' },
};

export function getTeamMatchStatusMeta(status: string): { label: string; className: string } {
  return TEAM_MATCH_STATUS_META[status] ?? TEAM_MATCH_STATUS_META.recruiting;
}

export function getGuestTeam(match: TeamMatch): SportTeam | null {
  if (match.guestTeam) {
    return match.guestTeam;
  }

  const approvedApplication = match.applications?.find((application) =>
    application.applicantTeamId === match.guestTeamId || application.status === 'approved');

  return approvedApplication?.applicantTeam ?? null;
}

export function getParticipantTeams(match: TeamMatch): TeamMatchParticipant[] {
  const participants: TeamMatchParticipant[] = [];

  if (match.hostTeam) {
    participants.push({
      id: match.hostTeam.id,
      name: match.hostTeam.name,
      isHost: true,
      logoUrl: match.hostTeam.logoUrl,
      team: match.hostTeam,
    });
  }

  const guestTeam = getGuestTeam(match);
  if (guestTeam) {
    participants.push({
      id: guestTeam.id,
      name: guestTeam.name,
      isHost: false,
      logoUrl: guestTeam.logoUrl,
      team: guestTeam,
    });
  }

  return participants;
}

export function getParticipantTeamIds(match: TeamMatch): string[] {
  return getParticipantTeams(match).map((team) => team.id);
}

export function getMyParticipantTeams(match: TeamMatch, myTeams: MyTeam[] | undefined): MyTeam[] {
  const ids = new Set(getParticipantTeamIds(match));
  return (myTeams ?? []).filter((team) => ids.has(team.id));
}

export function getOpponentTeam(match: TeamMatch, teamId: string): TeamMatchParticipant | null {
  return getParticipantTeams(match).find((team) => team.id !== teamId) ?? null;
}

export function getArrivalCheck(match: TeamMatch, teamId: string): TeamMatchArrivalCheck | null {
  return match.arrivalChecks?.find((arrival) => arrival.teamId === teamId) ?? null;
}

export function getEvaluation(match: TeamMatch, evaluatorTeamId: string): TeamMatchEvaluation | null {
  return match.evaluations?.find((evaluation) => evaluation.evaluatorTeamId === evaluatorTeamId) ?? null;
}

export function isArrivalOpen(status: string): boolean {
  return ['scheduled', 'checking_in', 'in_progress'].includes(status);
}

export function isScoreEditable(status: string): boolean {
  return ['scheduled', 'checking_in', 'in_progress'].includes(status);
}

export function buildQuarterScoreMap(quarterCount: number, source?: TeamMatchQuarterScoreMap | null): TeamMatchQuarterScoreMap {
  const scores: TeamMatchQuarterScoreMap = {};

  for (let quarter = 1; quarter <= quarterCount; quarter += 1) {
    const key = `Q${quarter}`;
    scores[key] = Number(source?.[key] ?? 0);
  }

  return scores;
}

export function getQuarterKeys(quarterCount: number): string[] {
  return Array.from({ length: quarterCount }, (_, index) => `Q${index + 1}`);
}

export function getOutcome(homeTotal: number, awayTotal: number): {
  home: TeamMatchOutcome;
  away: TeamMatchOutcome;
} {
  if (homeTotal > awayTotal) {
    return { home: 'win', away: 'lose' };
  }

  if (homeTotal < awayTotal) {
    return { home: 'lose', away: 'win' };
  }

  return { home: 'draw', away: 'draw' };
}
