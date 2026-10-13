import type { AdminContextService, V1ActiveAdmin } from '../common/admin-context.service';
import type { GamesService } from '../games/games.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { PrismaService } from '../prisma/prisma.service';
import { assignLeagueFixtureSideInTx } from './league-fixture-side-assignment';
import { LeagueMatchAdminService } from './league-match-admin.service';

jest.mock('./league-fixture-side-assignment', () => ({ assignLeagueFixtureSideInTx: jest.fn(async () => undefined) }));

// 경기 수정의 팀 바꾸기 — 실제 변경은 자리 배정 함수가 하고, 여기서는 순서(맞바꾸기)와 가드만 본다.

const assign = assignLeagueFixtureSideInTx as jest.MockedFunction<typeof assignLeagueFixtureSideInTx>;
const admin = { userId: 'admin-1' } as V1ActiveAdmin;
const registrations = [
  { id: 'reg-a', teamId: 'team-a' },
  { id: 'reg-b', teamId: 'team-b' },
  { id: 'reg-c', teamId: 'team-c' },
];

function setup() {
  const tx = {
    v1TournamentRegistration: {
      findMany: jest.fn(async ({ where }: { where: { teamId: { in: string[] } } }) =>
        registrations.filter((row) => where.teamId.in.includes(row.teamId))),
    },
  };
  const service = new LeagueMatchAdminService(
    {} as PrismaService,
    {} as AdminContextService,
    {} as GamesService,
    {} as NotificationsService,
  );
  const change = (
    current: { hostTeamId: string | null; approvedApplicantTeamId: string | null; homeSlotId?: string | null; awaySlotId?: string | null },
    dto: { homeTeamId?: string; awayTeamId?: string },
  ) =>
    (service as unknown as {
      changeFixtureTeamsInTx: (tx: unknown, admin: V1ActiveAdmin, teamMatch: unknown, dto: unknown) => Promise<boolean>;
    }).changeFixtureTeamsInTx(tx, admin, { id: 'tm-1', leagueId: 'league-1', homeSlotId: null, awaySlotId: null, ...current }, dto);
  return { change };
}

const calls = () => assign.mock.calls.map(([, , , input]) => `${input.side}:${input.registrationId}`);

describe('LeagueMatchAdminService.changeFixtureTeamsInTx', () => {
  beforeEach(() => assign.mockClear());

  it('원정 팀만 바꾸면 원정 사이드만 배정한다', async () => {
    const { change } = setup();
    await expect(change({ hostTeamId: 'team-a', approvedApplicantTeamId: 'team-b' }, { awayTeamId: 'team-c' })).resolves.toBe(true);
    expect(calls()).toEqual(['AWAY:reg-c']);
  });

  it('홈·원정을 맞바꾸면 원정을 먼저 비우고 홈 → 원정 순서로 배정한다', async () => {
    const { change } = setup();
    await change({ hostTeamId: 'team-a', approvedApplicantTeamId: 'team-b' }, { homeTeamId: 'team-b', awayTeamId: 'team-a' });
    expect(calls()).toEqual(['AWAY:null', 'HOME:reg-b', 'AWAY:reg-a']);
  });

  it('바뀐 게 없으면 아무것도 하지 않는다', async () => {
    const { change } = setup();
    await expect(change({ hostTeamId: 'team-a', approvedApplicantTeamId: 'team-b' }, { homeTeamId: 'team-a' })).resolves.toBe(false);
    expect(assign).not.toHaveBeenCalled();
  });

  it('같은 팀끼리·참가 확정 안 된 팀·자리 방식 경기는 막는다', async () => {
    const { change } = setup();
    await expect(change({ hostTeamId: 'team-a', approvedApplicantTeamId: 'team-b' }, { awayTeamId: 'team-a' }))
      .rejects.toMatchObject({ response: { code: 'FIXTURE_SAME_TEAM' } });
    await expect(change({ hostTeamId: 'team-a', approvedApplicantTeamId: 'team-b' }, { awayTeamId: 'team-z' }))
      .rejects.toMatchObject({ response: { code: 'LEAGUE_TEAM_INVALID' } });
    await expect(change({ hostTeamId: 'team-a', approvedApplicantTeamId: 'team-b', homeSlotId: 'slot-1' }, { homeTeamId: 'team-c' }))
      .rejects.toMatchObject({ response: { code: 'SLOT_LINKED' } });
    expect(assign).not.toHaveBeenCalled();
  });
});
