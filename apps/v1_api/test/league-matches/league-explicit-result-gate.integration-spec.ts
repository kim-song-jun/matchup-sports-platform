import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { randomUUID } from 'node:crypto';
import { canonicalGameCommandPayloadHash } from '../../src/games/games.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { seedCompetitionConfigVersions } from '../../src/tournaments/competition-config/competition-config-backfill';
import { createV1IntegrationApp } from '../integration/integration-app';
import { createLeagueSlotHarness, type LeagueSlotHarness } from './helpers/league-slot-harness';

describe('PR1992: 명시적으로 시작하는 리그의 결과 입력 경계', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let h: LeagueSlotHarness;

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    await seedCompetitionConfigVersions(app.get(PrismaService));
    h = await createLeagueSlotHarness(app, 'pr1992-results');
  });
  afterAll(async () => cleanup?.());

  async function fixture() {
    const [home, away] = [await h.makeTeam('결과 홈'), await h.makeTeam('결과 원정')];
    const leagueId = await h.makeLeague({ teams: [home, away], state: 'active' });
    const matchId = await h.createFixture(leagueId, { homeTeamId: home.id, awayTeamId: away.id });
    const game = await h.prisma.v1Game.findUniqueOrThrow({ where: { teamMatchId: matchId } });
    return { leagueId, game };
  }
  const createDraft = (gameId: string, version: number) => {
    const command = randomUUID();
    return request(app.getHttpServer()).post(`/api/v1/games/${gameId}/result-revisions`)
      .set('x-v1-user-id', h.adminUserId).set('Idempotency-Key', command).send({
        expectedVersion: version, clientCommandId: command, score: { home: 0, away: 0 },
        actualParticipants: [], eventsHash: canonicalGameCommandPayloadHash([]), reason: '결과 경계 검증',
      });
  };

  it.each(['draft', 'open', 'closed'] as const)('%s에서는 결과 초안을 만들지 못한다', async status => {
    const { leagueId, game } = await fixture();
    await h.prisma.v1Tournament.update({ where: { id: leagueId }, data: { status, requiresExplicitStart: true } });
    const response = await createDraft(game.id, game.version);
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('LEAGUE_NOT_STARTED');
    expect(await h.prisma.v1GameResultRevision.count({ where: { gameId: game.id } })).toBe(0);
    expect(await h.prisma.v1Game.findUniqueOrThrow({ where: { id: game.id } })).toMatchObject({ version: game.version, state: 'SCHEDULED' });
  });

  it.each(['draft', 'open', 'closed'] as const)('%s에서는 기존 결과 초안도 제출하지 못한다', async status => {
    const { leagueId, game } = await fixture();
    const created = await createDraft(game.id, game.version).expect(201);
    const revision = created.body.data;
    await h.prisma.v1Tournament.update({ where: { id: leagueId }, data: { status, requiresExplicitStart: true } });
    const command = randomUUID();
    const response = await request(app.getHttpServer()).post(`/api/v1/games/${game.id}/result-revisions/${revision.revisionId}/submit`)
      .set('x-v1-user-id', h.adminUserId).set('Idempotency-Key', command)
      .send({ expectedVersion: revision.version, clientCommandId: command });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('LEAGUE_NOT_STARTED');
    expect(await h.prisma.v1GameResultRevision.findUniqueOrThrow({ where: { id: revision.revisionId } })).toMatchObject({ state: 'DRAFT' });
    expect(await h.prisma.v1Game.findUniqueOrThrow({ where: { id: game.id } })).toMatchObject({ version: revision.version, state: 'SCHEDULED' });
  });

  it('기존 자동 시작 리그의 결과 제출 경로는 유지한다', async () => {
    const { leagueId, game } = await fixture();
    await h.prisma.v1Tournament.update({ where: { id: leagueId }, data: { status: 'draft', requiresExplicitStart: false } });
    const created = await createDraft(game.id, game.version).expect(201);
    const command = randomUUID();
    await request(app.getHttpServer()).post(`/api/v1/games/${game.id}/result-revisions/${created.body.data.revisionId}/submit`)
      .set('x-v1-user-id', h.adminUserId).set('Idempotency-Key', command)
      .send({ expectedVersion: created.body.data.version, clientCommandId: command }).expect(201);
    expect(await h.prisma.v1Game.findUniqueOrThrow({ where: { id: game.id } })).toMatchObject({ state: 'ENDED' });
  });
});
