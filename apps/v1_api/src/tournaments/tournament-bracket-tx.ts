import { NotFoundException } from '@nestjs/common';
import { Prisma, type V1TournamentGroup, type V1TournamentGroupPhase } from '@prisma/client';
import { writeAdminActionLog, type V1ActiveAdmin } from '../common/admin-context.service';
import {
  fairPlayByRegistrationFromGroups,
  recalculateAndUpsertGroupStandings,
} from './tournament-group-standings';
import { recalculateAndUpsertOverallStandings } from './tournament-overall-standings';
import { loadCanonicalStandingsSource } from './tournament-standings-source';

type Tx = Prisma.TransactionClient;

/**
 * 대진 변경 `…InTx` 함수 모음. 서비스 메서드는 권한 확인·락·응답 직렬화만 하고 변경 본문은 여기 있어서,
 * 템플릿·자리 서비스가 여러 변경을 한 트랜잭션에 묶을 수 있다. 대회 대진 변경은 호출자가
 * `league-fixture-generation:{tournamentId}` advisory lock 을 먼저 잡았다고 가정한다.
 */

export async function createGroupInTx(
  tx: Tx,
  admin: V1ActiveAdmin,
  tournamentId: string,
  input: { name: string; phase: V1TournamentGroupPhase; sortOrder: number; advanceCount: number | null },
): Promise<V1TournamentGroup> {
  const group = await tx.v1TournamentGroup.create({
    data: {
      tournamentId,
      name: input.name,
      phase: input.phase,
      sortOrder: input.sortOrder,
      advanceCount: input.advanceCount,
    },
  });
  await writeAdminActionLog(tx, admin, {
    action: 'tournament.bracket.group.create',
    targetType: 'tournament_group',
    targetId: group.id,
    afterJson: { tournamentId, name: group.name, phase: group.phase },
  });
  return group;
}

/** 조별·통합 순위 전체 재계산. 호출자 tx 안에서 돌고 감사 로그는 호출자가 남긴다. */
export async function recalculateStandingsInTx(tx: Tx, tournamentId: string) {
  const source = await loadCanonicalStandingsSource(tx, tournamentId);
  if (source === null) {
    throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: '대회를 찾을 수 없어요.' });
  }
  const { groups, config, configVersionId: competitionConfigVersionId, recalculatedAt: now } = source;
  // 모든 조의 픽스처를 넘겨 한 번에 집계한 페어플레이 벌점 Map 을 그룹별·통합 upsert 양쪽에 넘긴다.
  const fairPlayByRegistration = fairPlayByRegistrationFromGroups(groups);
  for (const group of groups) {
    await recalculateAndUpsertGroupStandings(
      tx,
      { tournamentId, configVersionId: competitionConfigVersionId, config, group, fairPlayByRegistration },
      now,
    );
  }

  // 조별 upsert 를 부르는 경로는 같은 tx 에서 통합 upsert 도 불러야 조별 화면과 통합 화면이 어긋나지 않는다.
  await recalculateAndUpsertOverallStandings(
    tx,
    { tournamentId, configVersionId: competitionConfigVersionId, config, groups, fairPlayByRegistration },
    now,
  );
  return {
    groupCount: groups.length,
    recalculatedAt: now,
    competitionConfigVersionId,
    audit: { groupCount: groups.length, recalculatedAt: now.toISOString(), competitionConfigVersionId },
  };
}

/**
 * 조별 순위는 조 편성(V1TournamentGroupTeam) 기준으로 계산·표시된다. 조별리그(`group`) 조 안의
 * 경기에 들어가는 팀이 편성에 없으면 순위표에서 빠지므로, 경기를 넣는 같은 트랜잭션에서 편성한다.
 * 결선 단계 조는 편성이 대진 자리(부전승·정원)를 뜻해서 건드리지 않는다.
 */
export async function ensureGroupPhaseTeamsInTx(
  tx: Tx,
  admin: V1ActiveAdmin,
  tournamentId: string,
  groupId: string,
  groupPhase: string,
  registrationIds: ReadonlyArray<string | null | undefined>,
): Promise<void> {
  if (groupPhase !== 'group') return;
  const ids = [...new Set(registrationIds.filter((id): id is string => typeof id === 'string'))];
  if (ids.length === 0) return;
  const assigned = await tx.v1TournamentGroupTeam.findMany({
    where: { groupId },
    select: { registrationId: true, sortOrder: true },
  });
  const assignedIds = new Set(assigned.map((team) => team.registrationId));
  let nextSortOrder = assigned.length === 0 ? 0 : Math.max(...assigned.map((team) => team.sortOrder)) + 1;
  // 순위 행이 하나라도 있는 조는 행만 보여 줘서, 새 편성 팀은 재계산 전까지 표에서 빠진다.
  const groupHasStandings = (await tx.v1TournamentStanding.count({ where: { groupId } })) > 0;
  const createdTeamIds: string[] = [];
  for (const registrationId of ids) {
    if (assignedIds.has(registrationId)) continue;
    const created = await tx.v1TournamentGroupTeam.create({
      data: { groupId, registrationId, isBye: false, sortOrder: nextSortOrder++ },
    });
    await writeAdminActionLog(tx, admin, {
      action: 'tournament.bracket.group_team.create',
      targetType: 'tournament_group_team',
      targetId: created.id,
      afterJson: { groupId, registrationId, isBye: false, auto: 'fixture', standingsRecalculated: groupHasStandings },
    });
    createdTeamIds.push(created.id);
  }
  if (createdTeamIds.length > 0 && groupHasStandings) {
    const recalculated = await recalculateStandingsInTx(tx, tournamentId);
    await writeAdminActionLog(tx, admin, {
      action: 'tournament.bracket.standings.recalculate_auto',
      targetType: 'tournament',
      targetId: tournamentId,
      afterJson: { trigger: 'fixture_group_team_enroll', groupId, ...recalculated.audit },
    });
  }
}
