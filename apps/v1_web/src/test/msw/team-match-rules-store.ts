import type {
  V1Game, V1TeamMatch, V1TeamMatchEdit, V1TeamMatchMutationPayload,
  V1TeamMatchMutationResult, V1TeamMatchPeriod, V1TeamMatchPeriodInput,
  V1TeamMatchRulesLockedReason,
} from '@/types/api';
import { v1SportsFixture } from './fixtures';
import type { TeamMatchRulesHostFixture } from './team-match-rules.fixtures';

export type StoredTeamMatchRules = {
  readonly detail: V1TeamMatch;
  readonly form: V1TeamMatchMutationPayload;
  readonly pinId: string | null;
  readonly periods: readonly V1TeamMatchPeriod[] | null;
  readonly gameId: string | null;
  readonly version: string;
  readonly rulesLockedReason: V1TeamMatchRulesLockedReason | null;
};

function normalizePeriods(inputs: readonly V1TeamMatchPeriodInput[]): readonly V1TeamMatchPeriod[] {
  if (inputs.length === 1) return inputs.map(input => ({ ...input, code: 'SINGLE_PERIOD', label: '단일', extraTime: false }));
  return inputs.map((input, index) => ({
    ...input, code: index === 0 ? 'FIRST_HALF' : 'SECOND_HALF',
    label: index === 0 ? '전반' : '후반', extraTime: false,
  }));
}

export function pinForPeriods(host: TeamMatchRulesHostFixture, periods: readonly V1TeamMatchPeriod[]) {
  return JSON.stringify(periods) === JSON.stringify(host.periods)
    ? host.competitionConfigVersionId
    : `msw-config-${host.sportId}-${periods.map(period => period.durationMinutes).join('-')}`;
}

export function hostRulesBlockedReason(host: TeamMatchRulesHostFixture | undefined): V1TeamMatchRulesLockedReason | null {
  if (!host?.competitionConfigVersionId || !host.periods) return 'COMPETITION_CONFIG_REQUIRED';
  const singlePeriod = host.periods.length === 1 && host.periods[0]?.code === 'SINGLE_PERIOD' && !host.periods[0].extraTime;
  const twoPeriods = host.periods.length === 2 && host.periods[0]?.code === 'FIRST_HALF'
    && host.periods[1]?.code === 'SECOND_HALF' && host.periods.every(period => !period.extraTime);
  if (!singlePeriod && !twoPeriods) return 'COMPETITION_PERIODS_UNAVAILABLE';
  return null;
}

export function periodWriteBlockedReason(
  host: TeamMatchRulesHostFixture, periods: readonly V1TeamMatchPeriodInput[] | undefined, existing?: StoredTeamMatchRules,
): V1TeamMatchRulesLockedReason | null {
  if (periods === undefined) return existing || host.competitionConfigVersionId ? null : 'COMPETITION_CONFIG_REQUIRED';
  const blocked = existing?.rulesLockedReason ?? hostRulesBlockedReason(host);
  if (blocked) return blocked;
  const currentPeriods = existing ? existing.periods : host.periods;
  // Expanding a single pin requires real identities from the active global two-half history.
  if (currentPeriods?.length === 1 && currentPeriods[0]?.code === 'SINGLE_PERIOD'
    && periods.length === 2 && host.twoPeriodDefaults === null) return 'COMPETITION_PERIODS_UNAVAILABLE';
  return null;
}

export function createTeamMatchRulesStore(initial: readonly V1TeamMatch[]) {
  const matches = new Map<string, StoredTeamMatchRules>();
  let sequence = 0;
  const reset = () => {
    matches.clear();
    sequence = 0;
    initial.forEach(detail => matches.set(detail.id, {
      detail: { ...detail, teamMatchId: detail.id, periods: null },
      form: {
        hostTeamId: detail.hostTeamId ?? '',
        sportId: detail.sport?.sportId ?? v1SportsFixture.find(sport => sport.name === detail.sportName)?.id ?? '',
        regionId: detail.region?.regionId ?? '', title: detail.title,
        startsAt: detail.startsAt, manualPlaceName: detail.placeName,
        description: detail.description, endsAt: detail.endsAt, deadlineAt: detail.deadlineAt,
        rulesText: detail.rulesText, costNote: detail.costNote,
        matchFormat: detail.matchFormat, matchStyle: detail.matchStyle, uniformColor: detail.uniformColor,
        genderRule: detail.genderRule, minLevelCode: detail.minLevelCode, maxLevelCode: detail.maxLevelCode,
      },
      pinId: null, periods: null, gameId: detail.gameId ?? null,
      version: 'msw-historical-1', rulesLockedReason: 'TEAM_MATCH_RULES_LOCKED',
    }));
  };
  reset();

  const write = (payload: V1TeamMatchMutationPayload, host: TeamMatchRulesHostFixture, existing?: StoredTeamMatchRules) => {
    sequence += 1;
    const id = existing?.detail.id ?? `msw-team-match-${sequence}`;
    const periods = payload.periods === undefined ? (existing ? existing.periods : host.periods) : normalizePeriods(payload.periods);
    const pinId = payload.periods === undefined && existing ? existing.pinId
      : periods ? pinForPeriods(host, periods) : null;
    const gameId = existing ? existing.gameId : `msw-team-match-game-${sequence}`;
    const detail: V1TeamMatch = {
      ...existing?.detail, id, teamMatchId: id, gameId, periods,
      title: payload.title, description: payload.description, imageUrl: payload.imageUrl,
      listImageUrl: payload.listImageUrl, sportName: host.sportName,
      sport: { sportId: host.sportId, name: host.sportName },
      placeName: payload.manualPlaceName, startsAt: payload.startsAt, endsAt: payload.endsAt,
      deadlineAt: payload.deadlineAt, capacityText: existing?.detail.capacityText ?? '상대 0/1팀',
      status: existing?.detail.status ?? 'recruiting', hostTeamId: host.hostTeamId, hostTeamName: host.name,
      rulesText: payload.rulesText, costNote: payload.costNote, matchFormat: payload.matchFormat,
      matchStyle: payload.matchStyle, uniformColor: payload.uniformColor, genderRule: payload.genderRule,
      minLevelCode: payload.minLevelCode, maxLevelCode: payload.maxLevelCode,
    };
    const record: StoredTeamMatchRules = {
      detail, form: { ...payload }, periods, pinId, gameId, version: `msw-version-${sequence}`,
      rulesLockedReason: existing?.rulesLockedReason ?? null,
    };
    matches.set(id, record);
    return record;
  };

  const edit = (record: StoredTeamMatchRules, host: TeamMatchRulesHostFixture | undefined): V1TeamMatchEdit => {
    const editable = ['recruiting', 'closed'].includes(record.detail.status) && !record.detail.approvedOpponentTeam;
    const rulesLockedReason = !record.pinId ? 'COMPETITION_CONFIG_REQUIRED'
      : !editable ? 'TEAM_MATCH_RULES_LOCKED' : record.rulesLockedReason ?? hostRulesBlockedReason(host);
    return {
      teamMatchId: record.detail.id, editable, lockedReason: editable ? null : 'terminal_or_matched_status',
      rulesEditable: rulesLockedReason === null, rulesLockedReason,
      competitionConfigVersionId: record.pinId,
      form: { ...record.form, periods: record.periods?.map(({ durationMinutes }) => ({ durationMinutes })) ?? null },
      status: record.detail.status, version: record.version,
    };
  };

  const result = (record: StoredTeamMatchRules): V1TeamMatchMutationResult => ({
    teamMatchId: record.detail.id, gameId: record.gameId, status: record.detail.status,
    hostTeamId: record.form.hostTeamId, version: record.version,
    detailRoute: `/team-matches/${record.detail.id}`, manageRoute: `/team-matches/${record.detail.id}`,
  });

  const game = (gameId: string): V1Game | undefined => {
    const record = [...matches.values()].find(match => match.gameId === gameId);
    if (!record?.pinId || !record.periods) return undefined;
    return {
      id: gameId, sourceType: 'TEAM_MATCH', state: 'SCHEDULED', version: 1, lastSequence: 0,
      competitionConfigVersionId: record.pinId, currentOfficialRevisionId: null,
      sides: [], lineups: [], actorRole: 'team_owner',
      periods: record.periods.map((_period, index) => ({ id: `${gameId}-period-${index + 1}`, gameId, number: index + 1, state: 'SCHEDULED', startedAt: null, endedAt: null })),
      periodDurations: record.periods.map(({ durationMinutes, extraTime }) => ({ durationMinutes, extraTime })),
    };
  };

  return { reset, write, edit, result, game, matches, listItems: () => [...matches.values()].map(record => record.detail) };
}
