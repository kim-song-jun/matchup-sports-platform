import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TeamMatchRecordService } from '../../src/team-matches/team-match-record.service';
import { ReviewsService } from '../../src/reviews/reviews.service';
import { ReviewPolicySettingsService } from '../../src/reviews/review-policy-settings.service';
import { AdminContextService } from '../../src/common/admin-context.service';
import { createSharedRecordFixture } from '../fixtures/team-match-shared-record.fixture';

const prisma = new PrismaService();
const records = new TeamMatchRecordService(prisma);
const adminContext = new AdminContextService(prisma);
const reviews = new ReviewsService(prisma, {} as never, adminContext, new ReviewPolicySettingsService(prisma, adminContext));
const actor = (id: string) => ({ id, email: null, accountStatus: 'active' as const, onboardingStatus: 'completed' as const });
const command = (action: 'add' | 'confirm' | 'reopen', expectedVersion: number, sideId?: string) => ({ action, expectedVersion, commandId: randomUUID(), ...(sideId ? { sideId } : {}) });

async function fixture(completed = false) {
  const f = await createSharedRecordFixture(prisma);
  await prisma.v1TeamMatch.update({ where: { id: f.match.id }, data: { platformManaged: true } });
  const admin = await prisma.v1AdminUser.create({ data: { userId: f.userIds[4], adminRole: 'ops' } });
  if (completed) {
    await records.mutate(actor(f.userIds[0]), f.match.id, command('confirm', 0));
    await records.mutate(actor(f.userIds[2]), f.match.id, command('confirm', 1));
  }
  return { ...f, admin, operator: actor(f.userIds[4]) };
}

describe('platform team match collaboration (real DB)', () => {
  beforeAll(() => prisma.$connect());
  afterAll(() => prisma.$disconnect());

  it('adds operator alongside both teams, resets stale confirmations and audits idempotently', async () => {
    const f = await fixture();
    const before = await records.read(f.operator, f.match.id);
    expect(before).toMatchObject({ operator: true, participant: false, ownSideId: null, canEdit: true });
    await records.mutate(actor(f.userIds[0]), f.match.id, command('confirm', 0));
    const input = command('add', 1, f.sides[1].id);
    const added = await records.mutate(f.operator, f.match.id, input);
    expect(added.confirmations).toEqual([]);
    expect(added.sides.find((side) => side.key === 'AWAY')?.score).toBe(1);
    expect(added.history[0].actorName).toBe('Teameet 운영');
    expect((await records.mutate(f.operator, f.match.id, input)).goals).toHaveLength(1);
    expect(await prisma.v1AdminActionLog.count({ where: { adminUserId: f.admin.id, action: 'team_match.record' } })).toBe(1);
    for (const action of ['confirm', 'reopen'] as const) {
      await expect(records.mutate(f.operator, f.match.id, command(action, 2))).rejects.toMatchObject({ response: { code: 'TEAM_CONFIRMATION_REQUIRED' } });
    }
    await records.mutate(actor(f.userIds[2]), f.match.id, command('add', 2, f.sides[0].id));
    await records.mutate(actor(f.userIds[0]), f.match.id, command('confirm', 3));
    expect((await records.mutate(actor(f.userIds[2]), f.match.id, command('confirm', 4))).phase).toBe('official');
    await expect(records.mutate(f.operator, f.match.id, command('add', 5, f.sides[0].id))).rejects.toMatchObject({ response: { code: 'RECORD_NOT_EDITABLE' } });
  });

  it('denies ordinary matches, support, revoked admins and suspended accounts', async () => {
    const f = await fixture();
    await prisma.v1TeamMatch.update({ where: { id: f.match.id }, data: { platformManaged: false } });
    expect((await records.read(f.operator, f.match.id)).canEdit).toBe(false);
    await prisma.v1TeamMatch.update({ where: { id: f.match.id }, data: { platformManaged: true } });
    for (const data of [{ adminRole: 'support' as const }, { adminRole: 'ops' as const, revokedAt: new Date() }]) {
      await prisma.v1AdminUser.update({ where: { id: f.admin.id }, data });
      await expect(records.mutate(f.operator, f.match.id, command('add', 0, f.sides[0].id))).rejects.toMatchObject({ status: 403 });
    }
    await prisma.v1AdminUser.update({ where: { id: f.admin.id }, data: { revokedAt: null } });
    await prisma.v1User.update({ where: { id: f.operator.id }, data: { accountStatus: 'suspended' } });
    expect((await records.read(f.operator, f.match.id)).canEdit).toBe(false);
  });

  it('keeps both-team participant editing after operators join; concurrent versions have one winner', async () => {
    const f = await fixture();
    const attempts = await Promise.allSettled([
      records.mutate(f.operator, f.match.id, command('add', 0, f.sides[0].id)),
      records.mutate(actor(f.userIds[1]), f.match.id, command('add', 0, f.sides[1].id)),
    ]);
    expect(attempts.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect((await records.read(actor(f.userIds[3]), f.match.id)).canEdit).toBe(true);
  });

  it('reviews actual players on both teams once across admins, reveals immediately without changing peer scores', async () => {
    const f = await fixture(true);
    const source = await reviews.source(f.operator, { sourceType: 'platform_team_match', sourceId: f.match.id });
    expect(source.targets.filter((target) => target.targetType === 'team')).toHaveLength(2);
    expect(source.targets.filter((target) => target.targetType === 'user')).toHaveLength(4);
    expect(source.targets.some((target) => target.targetUserId === f.operator.id)).toBe(false);
    const second = await prisma.v1User.create({ data: { email: `platform-review-${randomUUID()}@example.test`, accountStatus: 'active', onboardingStatus: 'completed' } });
    await prisma.v1AdminUser.create({ data: { userId: second.id, adminRole: 'owner' } });
    const payload = { sourceType: 'platform_team_match' as const, sourceId: f.match.id, targetType: 'user' as const, targetUserId: f.userIds[1], rating: 5, tagCodes: ['manner'] };
    const results = await Promise.all([reviews.submit(f.operator, payload), reviews.submit(actor(second.id), payload)]);
    expect(results.filter((result) => result.alreadySubmitted)).toHaveLength(1);
    expect(await prisma.v1PostEventReview.count({ where: { sourceType: 'platform_team_match', sourceId: f.match.id, targetUserId: f.userIds[1] } })).toBe(1);
    await expect(prisma.v1PostEventReview.create({ data: {
      reviewerUserId: second.id, sourceType: 'platform_team_match', sourceId: f.match.id,
      targetType: 'user', targetUserId: f.userIds[1], rating: 4,
      platformReviewKey: `${f.match.id}:user:${f.userIds[1]}`,
    } })).rejects.toMatchObject({ code: 'P2002' });
    const received = await reviews.received(actor(f.userIds[1]), {});
    expect(received.items).toEqual([expect.objectContaining({ sourceType: 'platform_team_match', reviewerUser: { userId: null, name: 'Teameet 운영', imageUrl: null } })]);
    expect((await reviews.receivedSummary(actor(f.userIds[1]), { targetType: 'user' })).bySport).toEqual([]);
    expect(await prisma.v1UserReputationSummary.findUnique({ where: { userId: f.userIds[1] } })).toBeNull();
    const peerSource = await reviews.source(actor(f.userIds[2]), { sourceType: 'team_match', sourceId: f.match.id });
    expect(peerSource.targets.find((target) => target.targetUserId === f.userIds[1])?.alreadySubmitted).toBe(false);
    expect(peerSource.targets.some((target) => target.targetUserId === f.operator.id)).toBe(false);
    await reviews.submit(f.operator, { ...payload, targetType: 'team', targetUserId: undefined, targetTeamId: f.teams[0].id });
    expect((await reviews.received(actor(f.userIds[0]), {})).items.some((review) => review.targetType === 'team')).toBe(true);
    await expect(reviews.submit(f.operator, { ...payload, targetUserId: f.operator.id })).rejects.toMatchObject({ response: { code: 'TARGET_NOT_REVIEWABLE' } });
    await expect(reviews.source(actor(f.userIds[0]), { sourceType: 'platform_team_match', sourceId: f.match.id })).rejects.toMatchObject({ status: 403 });
  });

  it('requires official completion, respects review deadline and denies revoked review writers', async () => {
    const f = await fixture();
    const params = { sourceType: 'platform_team_match' as const, sourceId: f.match.id };
    await expect(reviews.source(f.operator, params)).rejects.toMatchObject({ response: { code: 'SOURCE_NOT_COMPLETED' } });
    await records.mutate(actor(f.userIds[0]), f.match.id, command('confirm', 0));
    await records.mutate(actor(f.userIds[2]), f.match.id, command('confirm', 1));
    await prisma.v1TeamMatch.update({ where: { id: f.match.id }, data: { completedAt: new Date(Date.now() - 365 * 86400000) } });
    await expect(reviews.source(f.operator, params)).rejects.toMatchObject({ status: 410 });
    await prisma.v1AdminUser.update({ where: { id: f.admin.id }, data: { revokedAt: new Date() } });
    await expect(reviews.source(f.operator, params)).rejects.toMatchObject({ status: 403 });
  });
});
