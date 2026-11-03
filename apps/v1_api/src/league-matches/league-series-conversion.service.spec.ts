import { Prisma } from '@prisma/client';
import { LeagueSeriesConversionService } from './league-series-conversion.service';
import { PrismaService } from '../prisma/prisma.service';
import { AdminContextService } from '../common/admin-context.service';
import { V1AuthUser } from '../auth/v1-auth-user';
import { planLeagueConversion } from './league-series-conversion-plan';

const actor = { id: 'operator' } as V1AuthUser;
function setup() {
  const source = { id: 'source', sportId: 'sport', regionId: 'region', status: 'completed', seriesId: null, competitionConfigVersionId: 'config', updatedAt: new Date(0), sport: { code: 'futsal' }, registrations: Array.from({ length: 6 }, (_, i) => ({ team: { id: `t${i}`, name: `팀${i}`, sportId: 'sport', status: 'active', deletedAt: null, updatedAt: new Date(0) } })) };
  const matches = Array.from({ length: 5 }, (_, i) => ({ id: `m${i}`, hostTeamId: `t${i}`, approvedApplicantTeamId: `t${i + 1}`, status: 'matched', startAt: new Date(0), game: { id: `g${i}`, currentOfficialRevisionId: `r${i}`, currentOfficialRevision: { state: 'OFFICIAL' } } }));
  const facts = matches.map((m, i) => ({ gameId: m.game.id, homeScore: 6 - i, awayScore: 0 }));
  const tx = {
    v1Tournament: { findFirst: jest.fn().mockResolvedValue(source), create: jest.fn().mockResolvedValue({}), },
    v1AdminActionLog: { findFirst: jest.fn().mockResolvedValue(null) },
    v1TeamMatch: { findMany: jest.fn().mockResolvedValue(matches) },
    v1GameOfficialFact: { findMany: jest.fn().mockResolvedValue(facts) },
    v1LeagueSeries: { create: jest.fn().mockResolvedValue({ id: 'series' }) },
    v1Team: { findUnique: jest.fn().mockResolvedValue({ ownerUserId: 'owner' }) },
    v1TournamentRegistration: { upsert: jest.fn().mockResolvedValue({}) },
    v1OutboxJob: { createMany: jest.fn().mockResolvedValue({}) },
    $queryRaw: jest.fn().mockResolvedValue([]),
    $executeRaw: jest.fn().mockResolvedValue(1),
  };
  tx.v1GameOfficialFact.findMany.mockImplementation(async (args: { where: { revisionId: { in: string[] } } }) => facts.filter((f) => args.where.revisionId.in.includes(`r${f.gameId.slice(1)}`)));
  // 새 리그와 원본 조회를 구분하고 실제 참가팀 등록 헬퍼의 정원 검증을 통과한다.
  // 이어진 다음 시즌 찾기(`previousLeagueId`, 2026-11-03)는 기본 없음 — 테스트가 갈아끼운다.
  tx.v1Tournament.findFirst.mockImplementation(async (args) => JSON.stringify(args).includes('previousLeagueId') ? null : JSON.stringify(args).includes('source') ? source : { id: 'new', kind: 'regular_league', maxTeams: null });
  const prisma = { $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)) };
  const admins = { getMutationAdmin: jest.fn().mockResolvedValue({ id: 'admin' }), logAdminAction: jest.fn().mockResolvedValue({}) };
  const service = new LeagueSeriesConversionService(prisma as unknown as PrismaService, admins as unknown as AdminContextService);
  return { service, source, matches, facts, tx, admins, prisma };
}
async function bodyOf(s: ReturnType<typeof setup>) {
  const preview = await s.service.preview(actor, 'source', { tierSizes: [3, 3] });
  return { title: '정규 리그', startsOn: '2030-01-01T00:00:00Z', endsOn: '2030-03-01T00:00:00Z', tierSizes: [3, 3], fingerprint: preview.fingerprint, entries: preview.entries.map((e) => ({ teamId: e.teamId, tier: e.suggestedTier, reason: '' })) };
}
describe('독립 리그 최초 티어 배정', () => {
  // 2026-11-03 사용자 선택: 끝난 독립 리그는 다음 시즌 잇기와 리그 체계 전환 중 하나만 한다.
  it('다음 시즌을 이은 리그는 전환을 막고, 원본 행 잠금이 첫 문장이다', async () => {
    const s = setup();
    s.tx.v1Tournament.findFirst.mockImplementation(async (args) => JSON.stringify(args).includes('previousLeagueId') ? { id: 'next', title: '다음 시즌' } : s.source);
    await expect(s.service.preview(actor, 'source', { tierSizes: [3, 3] })).rejects.toMatchObject({ response: { code: 'LEAGUE_NEXT_SEASON_EXISTS' } });
    expect(String(s.tx.$queryRaw.mock.calls[0][0].join('?'))).toMatch(/v1_tournaments.*FOR UPDATE/s);
  });

  it('6팀 공식 결과 순위를 3팀씩 나누며 원본 경기·결과를 쓰지 않는다', async () => {
    const s = setup(); const body = await bodyOf(s);
    expect(body.entries.map((e) => e.teamId)).toEqual(['t0', 't1', 't2', 't3', 't4', 't5']);
    const result = await s.service.commit(actor, 'source', body);
    expect(result.leagues.map((e) => e.tier)).toEqual([1, 2]);
    expect(s.tx.v1Tournament.create.mock.calls.map((c) => c[0].data)).toEqual(expect.arrayContaining([expect.objectContaining({ seasonNo: 1, tier: 1, seriesId: 'series' }), expect.objectContaining({ seasonNo: 1, tier: 2 })]));
    expect(s.admins.logAdminAction).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ targetId: 'source', afterJson: expect.objectContaining({ seriesId: 'series' }) }), s.tx);
  });
  it('미확정 결과는 티어 배정에 사용하지 않는다', async () => {
    const s = setup(); s.matches[0].game.currentOfficialRevision.state = 'SUBMITTED';
    await expect(bodyOf(s)).rejects.toMatchObject({ response: { code: 'LEAGUE_RESULTS_PENDING' } });
  });
  it('종료 전과 재전환을 막는다', async () => {
    const s = setup(); s.source.status = 'in_progress';
    await expect(bodyOf(s)).rejects.toMatchObject({ response: { code: 'LEAGUE_NOT_COMPLETED' } });
    s.source.status = 'completed'; s.tx.v1AdminActionLog.findFirst.mockResolvedValue({ id: 'previous' });
    await expect(bodyOf(s)).rejects.toMatchObject({ response: { code: 'LEAGUE_ALREADY_CONVERTED' } });
  });
  it('미리보기 후 점수 변경을 감지한다', async () => {
    const s = setup(); const body = await bodyOf(s); s.facts[0].homeScore++;
    await expect(s.service.commit(actor, 'source', body)).rejects.toMatchObject({ response: { code: 'LEAGUE_CONVERSION_STALE' } });
    expect(s.tx.v1LeagueSeries.create).not.toHaveBeenCalled();
  });
  it('중복 팀과 임의 팀을 거절한다', async () => {
    const s = setup(); const body = await bodyOf(s); body.entries[0].teamId = body.entries[1].teamId;
    await expect(s.service.commit(actor, 'source', body)).rejects.toMatchObject({ response: { code: 'LEAGUE_CONVERSION_ENTRIES_INVALID' } });
  });
  it('자동 배정을 바꾸면 사유를 요구한다', async () => {
    const s = setup(); const body = await bodyOf(s); body.entries[0].tier = 2; body.entries[5].tier = 1;
    await expect(s.service.commit(actor, 'source', body)).rejects.toMatchObject({ response: { code: 'LEAGUE_CONVERSION_REASON_REQUIRED' } });
  });
  it('경계를 넘는 완전 동률과 티어별 최소 인원을 검사한다', () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({ teamId: `t${i}` }));
    expect(planLeagueConversion(rows, [3, 3], [{ teamIds: ['t2', 't3'] }]).boundaryTies).toHaveLength(1);
    expect(() => planLeagueConversion(rows, [1, 5], [])).toThrow();
    expect(() => planLeagueConversion(rows, [2, 2], [])).toThrow();
  });
  it('쓰기 권한이 없으면 미리보기와 확정 모두 거절한다', async () => {
    const s = setup(); s.admins.getMutationAdmin.mockRejectedValue(new Error('forbidden'));
    await expect(bodyOf(s)).rejects.toThrow('forbidden'); expect(s.prisma.$transaction).not.toHaveBeenCalled();
  });
  it.each([['P2034', undefined], ['P2010', { code: '40001' }], ['P2010', { code: '40P01' }]])('동시 확정의 %s 충돌을 409로 반환한다', async (code, meta) => {
    const s = setup(); const body = await bodyOf(s);
    s.prisma.$transaction.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('conflict', { code, meta, clientVersion: '6' }));
    await expect(s.service.commit(actor, 'source', body)).rejects.toMatchObject({ response: { code: 'LEAGUE_CONVERSION_CONFLICT' } });
  });
});
