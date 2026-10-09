// apps/v1_api/src/tournaments/slots/load-group-rank-preview.ts
import type { Prisma } from '@prisma/client';
import { resolveTournamentFixtureOfficialScore } from '../tournament-fixture-official-result';
import { resolveGroupRank, type GroupRankSource } from './group-rank-preview';
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
  const groupTeams = await client.v1TournamentGroupTeam.findMany({
    where: { groupId: { in: sourceGroupIds }, isBye: false },
    select: { groupId: true, registrationId: true, registration: { select: { team: { select: { name: true } } } } },
  });
  const standings = await client.v1TournamentStanding.findMany({
    where: { groupId: { in: sourceGroupIds } },
    select: { groupId: true, registrationId: true, position: true, wins: true, draws: true, losses: true },
  });
  const details = await client.v1TournamentMatchDetails.findMany({
    where: {
      tournamentId,
      groupId: { in: sourceGroupIds },
      teamMatch: { is: { deletedAt: null, status: { not: 'cancelled' } } },
    },
    select: {
      groupId: true,
      homeRegistrationId: true,
      awayRegistrationId: true,
      teamMatch: { select: { game: { select: { currentOfficialRevision: { select: { state: true, score: true } } } } } },
    },
  });

  const teamNames = new Map(groupTeams.map((row) => [row.registrationId, row.registration.team.name]));
  const sourceByGroup = new Map<string, GroupRankSource>();
  for (const groupId of sourceGroupIds) {
    sourceByGroup.set(groupId, {
      registrationIds: groupTeams.filter((row) => row.groupId === groupId).map((row) => row.registrationId),
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
      candidateTeamName: candidate === null ? null : (teamNames.get(candidate) ?? null),
      tiedRegistrationIds: resolution.state === 'tied' ? resolution.tiedRegistrationIds : [],
      currentRegistrationId: slot.registrationId,
    };
  });
  return { rows, groupMembers };
}
