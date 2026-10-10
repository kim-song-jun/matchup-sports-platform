// apps/v1_api/src/tournaments/slots/load-group-rank-preview.spec.ts
import type { Prisma } from '@prisma/client';
import { FOOTBALL_V1_CONFIG } from '../competition-config/competition-config';
import { calculateCompetitionStandings } from '../competition-config/competition-standings';
import { loadGroupRankPreview, loadGroupStandingSummaries } from './load-group-rank-preview';

type Result = readonly [home: string, away: string, homeScore: number, awayScore: number];

const CLEAN_A: Result[] = [['r-a', 'r-b', 2, 0], ['r-a', 'r-c', 1, 0], ['r-b', 'r-c', 1, 0]];
const TIED_A: Result[] = [['r-a', 'r-b', 0, 0], ['r-a', 'r-c', 1, 0], ['r-b', 'r-c', 1, 0]];
const GROUP_B: Result[] = [['r-d', 'r-e', 1, 0], ['r-d', 'r-f', 1, 0], ['r-e', 'r-f', 1, 0]];

function standingRows(groupId: string, ids: string[], results: Result[]) {
  return calculateCompetitionStandings({
    tournamentId: 'tournament-1',
    configVersionId: 'config-1',
    registrationIds: ids,
    fixtures: results.map(([home, away, homeScore, awayScore]) => ({ homeRegistrationId: home, awayRegistrationId: away, homeScore, awayScore })),
    config: FOOTBALL_V1_CONFIG,
  }).map((row) => ({ groupId, registrationId: row.registrationId, position: row.position, wins: row.wins, draws: row.draws, losses: row.losses }));
}

function detailRows(groupId: string, results: Result[], pendingIndex = -1) {
  return results.map(([home, away, homeScore, awayScore], index) => ({
    groupId,
    homeRegistrationId: home,
    awayRegistrationId: away,
    teamMatch: {
      game: {
        currentOfficialRevision: index === pendingIndex ? null : { state: 'OFFICIAL', score: { home: homeScore, away: awayScore } },
      },
    },
  }));
}

const slot = (id: string, position: number, sourceGroupId: string, sortOrder: number, groupName: string, registrationId: string | null = null) => ({
  id,
  position,
  registrationId,
  sourceGroupId,
  group: { name: '4강', phase: 'semi' },
  sourceGroup: { name: groupName, sortOrder },
});

function fakeClient(data: { slots: unknown[]; groupTeams: unknown[]; standings: unknown[]; details: unknown[] }) {
  const findSlots = jest.fn().mockResolvedValue(data.slots);
  const findTeams = jest.fn().mockResolvedValue(data.groupTeams);
  const findStandings = jest.fn().mockResolvedValue(data.standings);
  const findDetails = jest.fn().mockResolvedValue(data.details);
  const client = {
    v1TournamentSlot: { findMany: findSlots },
    v1TournamentGroupTeam: { findMany: findTeams },
    v1TournamentStanding: { findMany: findStandings },
    v1TournamentMatchDetails: { findMany: findDetails },
  } as unknown as Prisma.TransactionClient;
  return { client, findSlots, findTeams, findStandings, findDetails };
}

const team = (groupId: string, registrationId: string, name: string) => ({ groupId, registrationId, registration: { team: { name } } });
const TEAMS = [
  team('grp-a', 'r-a', '가FC'), team('grp-a', 'r-b', '나FC'), team('grp-a', 'r-c', '다FC'),
  team('grp-b', 'r-d', '라FC'), team('grp-b', 'r-e', '마FC'), team('grp-b', 'r-f', '바FC'),
];

describe('loadGroupRankPreview', () => {
  it('자리를 조 순서·순위 순으로 돌려주고, 끝난 조는 ready·덜 끝난 조는 group_incomplete 로 판정한다', async () => {
    const { client } = fakeClient({
      // 일부러 섞어서 준다 — 정렬은 로더 책임이다.
      slots: [slot('s-b1', 1, 'grp-b', 1, 'B조'), slot('s-a2', 2, 'grp-a', 0, 'A조', 'r-b'), slot('s-a1', 1, 'grp-a', 0, 'A조')],
      groupTeams: TEAMS,
      standings: [...standingRows('grp-a', ['r-a', 'r-b', 'r-c'], CLEAN_A), ...standingRows('grp-b', ['r-d', 'r-e', 'r-f'], GROUP_B)],
      details: [...detailRows('grp-a', CLEAN_A), ...detailRows('grp-b', GROUP_B, 2)],
    });

    const preview = await loadGroupRankPreview(client, 'tournament-1');

    expect(preview.rows).toEqual([
      { slotId: 's-a1', label: 'A조 1위', state: 'ready', candidateRegistrationId: 'r-a', candidateTeamName: '가FC', tiedRegistrationIds: [], currentRegistrationId: null },
      { slotId: 's-a2', label: 'A조 2위', state: 'ready', candidateRegistrationId: 'r-b', candidateTeamName: '나FC', tiedRegistrationIds: [], currentRegistrationId: 'r-b' },
      { slotId: 's-b1', label: 'B조 1위', state: 'group_incomplete', candidateRegistrationId: null, candidateTeamName: null, tiedRegistrationIds: [], currentRegistrationId: null },
    ]);
    expect([...(preview.groupMembers.get('s-a1') ?? [])].sort()).toEqual(['r-a', 'r-b', 'r-c']);
    expect([...(preview.groupMembers.get('s-b1') ?? [])].sort()).toEqual(['r-d', 'r-e', 'r-f']);
  });

  it('완전 동률 구간의 자리는 후보 없이 tied 로, 구간 밖 자리는 ready 로 돌려준다', async () => {
    const { client } = fakeClient({
      slots: [slot('s-a1', 1, 'grp-a', 0, 'A조'), slot('s-a2', 2, 'grp-a', 0, 'A조'), slot('s-a3', 3, 'grp-a', 0, 'A조')],
      groupTeams: TEAMS,
      standings: standingRows('grp-a', ['r-a', 'r-b', 'r-c'], TIED_A),
      details: detailRows('grp-a', TIED_A),
    });

    const { rows } = await loadGroupRankPreview(client, 'tournament-1');

    expect(rows.map((row) => [row.slotId, row.state, row.candidateRegistrationId, row.tiedRegistrationIds])).toEqual([
      ['s-a1', 'tied', null, ['r-a', 'r-b']],
      ['s-a2', 'tied', null, ['r-a', 'r-b']],
      ['s-a3', 'ready', 'r-c', []],
    ]);
  });

  it('취소·삭제된 경기를 읽지 않도록 조건을 건다 — 취소 경기가 남아 있어도 조가 영원히 미완료가 되지 않게', async () => {
    const { client, findDetails, findSlots } = fakeClient({
      slots: [slot('s-a1', 1, 'grp-a', 0, 'A조')],
      groupTeams: TEAMS,
      standings: standingRows('grp-a', ['r-a', 'r-b', 'r-c'], CLEAN_A),
      details: detailRows('grp-a', CLEAN_A),
    });

    await loadGroupRankPreview(client, 'tournament-1');

    expect(findSlots).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tournamentId: 'tournament-1', kind: 'GROUP_RANK' }) }));
    expect(findDetails).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tournamentId: 'tournament-1',
          groupId: { in: ['grp-a'] },
          teamMatch: { is: { deletedAt: null, status: { not: 'cancelled' } } },
        }),
      }),
    );
  });

  it('GROUP_RANK 자리가 없는 대회(토너먼트 등)는 빈 결과를 돌려주고 다른 표를 읽지 않는다', async () => {
    const { client, findTeams, findStandings, findDetails } = fakeClient({ slots: [], groupTeams: [], standings: [], details: [] });

    const preview = await loadGroupRankPreview(client, 'tournament-1');

    expect(preview.rows).toEqual([]);
    expect(preview.groupMembers.size).toBe(0);
    expect(findTeams).not.toHaveBeenCalled();
    expect(findStandings).not.toHaveBeenCalled();
    expect(findDetails).not.toHaveBeenCalled();
  });
});

describe('loadGroupStandingSummaries', () => {
  // r-a→r-b→r-c→r-a 로 이긴 3팀 완전 동률 조 + 동률 없는 조(대조).
  const TIE_THREE: Result[] = [['r-a', 'r-b', 1, 0], ['r-b', 'r-c', 1, 0], ['r-c', 'r-a', 1, 0]];

  function summaryClient(options: { groups?: unknown[]; knockout?: unknown[]; pendingInTie?: boolean } = {}) {
    const findGroups = jest.fn().mockResolvedValue(
      options.groups ?? [{ id: 'grp-a', advanceCount: 2 }, { id: 'grp-b', advanceCount: 2 }],
    );
    const findTeams = jest.fn().mockResolvedValue(TEAMS);
    const findStandings = jest.fn().mockResolvedValue([
      ...standingRows('grp-a', ['r-a', 'r-b', 'r-c'], TIE_THREE),
      ...standingRows('grp-b', ['r-d', 'r-e', 'r-f'], GROUP_B),
    ]);
    const findDetails = jest.fn().mockImplementation(async (args: { where: { OR?: unknown } }) =>
      args.where.OR === undefined
        ? [...detailRows('grp-a', TIE_THREE, options.pendingInTie ? 2 : -1), ...detailRows('grp-b', GROUP_B)]
        : (options.knockout ?? []),
    );
    const client = {
      v1TournamentGroup: { findMany: findGroups },
      v1TournamentGroupTeam: { findMany: findTeams },
      v1TournamentStanding: { findMany: findStandings },
      v1TournamentMatchDetails: { findMany: findDetails },
    } as unknown as Prisma.TransactionClient;
    return { client, findGroups, findTeams, findDetails };
  }
  const placedMatch = (home: string | null, away: string | null) => ({ homeRegistrationId: home, awayRegistrationId: away });

  it('결선 경기에 아무도 안 들어갔으면 — 동률 조는 공동 1위·미정, 동률 없는 조는 상위 N팀(대조)', async () => {
    const { client } = summaryClient();

    const summaries = await loadGroupStandingSummaries(client, 'tournament-1');

    const tie = summaries.get('grp-a');
    expect([...(tie?.sharedRankByRegistrationId ?? [])].sort()).toEqual([['r-a', 1], ['r-b', 1], ['r-c', 1]]);
    expect(tie?.qualification).toEqual({ advancingRegistrationIds: [], undecided: true });
    const clean = summaries.get('grp-b');
    expect(clean?.sharedRankByRegistrationId.size).toBe(0);
    expect(clean?.qualification).toEqual({ advancingRegistrationIds: ['r-d', 'r-e'], undecided: false });
  });

  it('어드민이 동률 조에서 고른 팀(결선 경기에 배정)이 진출 팀이 된다 — 다른 조 팀이 섞여 있어도 이 조 소속만 센다', async () => {
    const { client } = summaryClient({ knockout: [placedMatch('r-b', 'r-c'), placedMatch('r-e', null)] });

    const summaries = await loadGroupStandingSummaries(client, 'tournament-1');

    expect(summaries.get('grp-a')?.qualification).toEqual({ advancingRegistrationIds: ['r-b', 'r-c'], undecided: false });
    expect(summaries.get('grp-b')?.qualification).toEqual({ advancingRegistrationIds: ['r-e'], undecided: false });
  });

  it('덜 끝난 조는 맵에 없다 — 끝난 조는 그대로 남는다(대조)', async () => {
    const { client } = summaryClient({ pendingInTie: true });

    const summaries = await loadGroupStandingSummaries(client, 'tournament-1');

    expect(summaries.has('grp-a')).toBe(false);
    expect(summaries.has('grp-b')).toBe(true);
  });

  it('결선 경기는 조별 단계가 아닌 경기만, 취소·보관·삭제된 경기는 빼고 읽는다', async () => {
    const { client, findGroups, findDetails } = summaryClient();

    await loadGroupStandingSummaries(client, 'tournament-1');

    expect(findGroups).toHaveBeenCalledWith(expect.objectContaining({ where: { tournamentId: 'tournament-1', phase: 'group' } }));
    expect(findDetails).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tournamentId: 'tournament-1',
          OR: [{ groupId: null }, { group: { is: { phase: { not: 'group' } } } }],
          teamMatch: { is: { deletedAt: null, status: { notIn: ['cancelled', 'archived'] } } },
        },
      }),
    );
  });

  it('조별 단계 조가 없는 대회는 빈 맵이고 다른 표를 읽지 않는다', async () => {
    const { client, findTeams, findDetails } = summaryClient({ groups: [] });

    expect((await loadGroupStandingSummaries(client, 'tournament-1')).size).toBe(0);
    expect(findTeams).not.toHaveBeenCalled();
    expect(findDetails).not.toHaveBeenCalled();
  });
});
