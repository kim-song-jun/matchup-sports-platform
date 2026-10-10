// apps/v1_api/src/tournaments/slots/load-group-rank-preview.ts
import type { Prisma } from '@prisma/client';
import { resolveTournamentFixtureOfficialScore } from '../tournament-fixture-official-result';
import {
  resolveGroupRank,
  summarizeGroupStanding,
  type GroupRankSource,
  type GroupStandingSummary,
} from './group-rank-preview';
import { tournamentSlotLabel } from './tournament-slot-label';

export type GroupRankPreviewRow = {
  slotId: string;
  label: string;
  state: 'ready' | 'tied' | 'group_incomplete';
  candidateRegistrationId: string | null;
  candidateTeamName: string | null;
  tiedRegistrationIds: string[];
  currentRegistrationId: string | null;
};

export type GroupRankPreview = {
  rows: GroupRankPreviewRow[];
  /** slotId → 그 자리가 순위를 가져오는 조의 소속 팀. 채우기의 override 검증에만 쓴다. */
  groupMembers: Map<string, ReadonlySet<string>>;
};

export async function loadGroupRankPreview(
  client: Prisma.TransactionClient,
  tournamentId: string,
): Promise<GroupRankPreview> {
  const slots = await client.v1TournamentSlot.findMany({
    where: { tournamentId, kind: 'GROUP_RANK', sourceGroupId: { not: null } },
    select: {
      id: true,
      position: true,
      registrationId: true,
      sourceGroupId: true,
      group: { select: { name: true, phase: true } },
      sourceGroup: { select: { name: true, sortOrder: true } },
    },
  });
  // where 가 sourceGroupId 를 보장하지만 타입은 nullable 이라 좁혀 둔다.
  const rankSlots = slots.flatMap((slot) =>
    slot.sourceGroupId !== null && slot.sourceGroup !== null
      ? [{ ...slot, sourceGroupId: slot.sourceGroupId, sourceGroup: slot.sourceGroup }]
      : [],
  );
  if (rankSlots.length === 0) return { rows: [], groupMembers: new Map() };

  const sourceGroupIds = [...new Set(rankSlots.map((slot) => slot.sourceGroupId))];
  const sourceByGroup = await loadGroupRankSources(client, tournamentId, sourceGroupIds);

  const ordered = [...rankSlots].sort(
    (left, right) => left.sourceGroup.sortOrder - right.sourceGroup.sortOrder || left.position - right.position,
  );
  const groupMembers = new Map<string, ReadonlySet<string>>();
  const rows = ordered.map((slot): GroupRankPreviewRow => {
    const source = sourceByGroup.get(slot.sourceGroupId)!;
    groupMembers.set(slot.id, new Set(source.registrationIds));
    const resolution = resolveGroupRank(source, slot.position);
    const candidate = resolution.state === 'ready' ? resolution.registrationId : null;
    return {
      slotId: slot.id,
      label: tournamentSlotLabel({
        kind: 'GROUP_RANK',
        position: slot.position,
        groupName: slot.group?.name ?? null,
        groupPhase: slot.group?.phase ?? null,
        sourceGroupName: slot.sourceGroup.name,
      }),
      state: resolution.state,
      candidateRegistrationId: candidate,
      candidateTeamName: candidate === null ? null : (source.teamNameById.get(candidate) ?? null),
      tiedRegistrationIds: resolution.state === 'tied' ? resolution.tiedRegistrationIds : [],
      currentRegistrationId: slot.registrationId,
    };
  });
  return { rows, groupMembers };
}

type LoadedGroupRankSource = GroupRankSource & { teamNameById: ReadonlyMap<string, string> };

/** 조별 순위 판정 입력. 어드민 미리보기와 공개 순위표가 같은 조회 조건을 쓰도록 한 곳에 둔다. */
async function loadGroupRankSources(
  client: Prisma.TransactionClient,
  tournamentId: string,
  groupIds: readonly string[],
): Promise<Map<string, LoadedGroupRankSource>> {
  const groupTeams = await client.v1TournamentGroupTeam.findMany({
    where: { groupId: { in: [...groupIds] }, isBye: false },
    select: { groupId: true, registrationId: true, registration: { select: { team: { select: { name: true } } } } },
  });
  const standings = await client.v1TournamentStanding.findMany({
    where: { groupId: { in: [...groupIds] } },
    select: { groupId: true, registrationId: true, position: true, wins: true, draws: true, losses: true },
  });
  const details = await client.v1TournamentMatchDetails.findMany({
    where: {
      tournamentId,
      groupId: { in: [...groupIds] },
      teamMatch: { is: { deletedAt: null, status: { not: 'cancelled' } } },
    },
    select: {
      groupId: true,
      homeRegistrationId: true,
      awayRegistrationId: true,
      teamMatch: { select: { game: { select: { currentOfficialRevision: { select: { state: true, score: true } } } } } },
    },
  });

  const sourceByGroup = new Map<string, LoadedGroupRankSource>();
  for (const groupId of groupIds) {
    const teams = groupTeams.filter((row) => row.groupId === groupId);
    sourceByGroup.set(groupId, {
      registrationIds: teams.map((row) => row.registrationId),
      teamNameById: new Map(teams.map((row) => [row.registrationId, row.registration.team.name])),
      standings: standings.filter((row) => row.groupId === groupId),
      fixtures: details
        .filter((row) => row.groupId === groupId)
        .map((row) => {
          const score = resolveTournamentFixtureOfficialScore(row.teamMatch.game);
          return {
            homeRegistrationId: row.homeRegistrationId,
            awayRegistrationId: row.awayRegistrationId,
            official: score === null ? null : { homeScore: score.homeScore, awayScore: score.awayScore },
          };
        }),
    });
  }
  return sourceByGroup;
}

/**
 * 공개 순위표용 조별 요약(공동 순위·진출 팀). 조별 단계(phase=group) 조만 대상이고,
 * 결선 경기(조별 단계가 아닌 경기)에 실제로 배정된 팀을 진출 팀의 근거로 쓴다.
 */
export async function loadGroupStandingSummaries(
  client: Prisma.TransactionClient,
  tournamentId: string,
): Promise<Map<string, GroupStandingSummary>> {
  const groups = await client.v1TournamentGroup.findMany({
    where: { tournamentId, phase: 'group' },
    select: { id: true, advanceCount: true },
  });
  if (groups.length === 0) return new Map();

  const sourceByGroup = await loadGroupRankSources(
    client,
    tournamentId,
    groups.map((group) => group.id),
  );
  // groupId null 은 조 없는 결선 경기. NOT 은 groupId null 행을 걸러 내므로 OR 로 둘 다 잡는다.
  const knockoutDetails = await client.v1TournamentMatchDetails.findMany({
    where: {
      tournamentId,
      OR: [{ groupId: null }, { group: { is: { phase: { not: 'group' } } } }],
      teamMatch: { is: { deletedAt: null, status: { notIn: ['cancelled', 'archived'] } } },
    },
    select: { homeRegistrationId: true, awayRegistrationId: true },
  });
  const placed = new Set<string>();
  for (const row of knockoutDetails) {
    if (row.homeRegistrationId !== null) placed.add(row.homeRegistrationId);
    if (row.awayRegistrationId !== null) placed.add(row.awayRegistrationId);
  }

  const summaries = new Map<string, GroupStandingSummary>();
  for (const group of groups) {
    const source = sourceByGroup.get(group.id);
    const summary = source === undefined ? null : summarizeGroupStanding(source, group.advanceCount, placed);
    if (summary !== null) summaries.set(group.id, summary);
  }
  return summaries;
}
