import { randomUUID } from 'node:crypto';
import { Prisma, V1OnboardingStatus } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { AdminService } from '../src/admin/admin.service';
import type { V1AuthUser } from '../src/auth/v1-auth-user';

// The integration runner clones the approved disposable database for this file.
describe('admin user signup/provider filters against PostgreSQL', () => {
  const prisma = new PrismaService();
  const service = new AdminService(prisma);
  const prefix = `admin-filter-${randomUUID()}`;
  const ids: Record<string, string> = {};
  let actor: V1AuthUser;

  async function member(key: string, status: V1OnboardingStatus, providers: Array<'email' | 'kakao' | 'apple'>, extra: Prisma.V1UserCreateInput = {}) {
    const row = await prisma.v1User.create({ data: {
      email: `${prefix}-${key}@example.test`, onboardingStatus: status,
      ...(status === 'social_terms_required' || status === 'social_profile_required' ? {} : { profile: { create: { nickname: `${prefix}-${key}` } } }),
      authIdentities: { create: providers.map((provider) => ({ provider, providerUserKey: `${prefix}-${key}-${provider}` })) },
      ...extra,
    } });
    ids[key] = row.id;
    return row;
  }

  beforeAll(async () => {
    const admin = await prisma.v1User.create({ data: { adminUser: { create: { adminRole: 'owner' } } } });
    ids.admin = admin.id;
    actor = { id: admin.id, email: null, accountStatus: 'active', onboardingStatus: 'completed' };
    await member('terms', 'social_terms_required', ['kakao']);
    await member('profile', 'social_profile_required', ['apple']);
    await member('deferred', 'social_profile_deferred', ['kakao', 'apple']);
    await member('ready', 'signup_done', ['email']);
    await member('complete', 'completed', ['email', 'kakao']);
    await member('suspended', 'completed', ['apple'], { accountStatus: 'suspended' });
    await member('deleted', 'completed', [], { accountStatus: 'deleted', profile: { create: { nickname: `${prefix}-deleted`, deletedAt: new Date() } } });
    await member('missing', 'completed', ['kakao'], { profile: undefined });
    await prisma.v1UserProfile.deleteMany({ where: { userId: ids.missing } });
    await prisma.v1AuthIdentity.create({ data: { userId: ids.complete, provider: 'apple', providerUserKey: `${prefix}-unlinked`, status: 'unlinked' } });
  });
  afterAll(async () => {
    await prisma.v1User.deleteMany({ where: { id: { in: Object.values(ids) } } });
    await prisma.$disconnect();
  });

  it('combines OR providers and OR signup stages with AND account/search filters without duplicate users', async () => {
    const result = await service.listUsers(actor, { q: prefix, status: 'active', signup: ['incomplete', 'profile_deferred'], providers: ['kakao', 'apple'], page: 1, limit: 2 });
    expect(result.pageInfo).toMatchObject({ total: 4, totalPages: 2, hasNext: true });
    expect(new Set(result.items.map((item) => item.userId)).size).toBe(2);
    const second = await service.listUsers(actor, { q: prefix, status: 'active', signup: ['incomplete', 'profile_deferred'], providers: ['kakao', 'apple'], page: 2, limit: 2 });
    expect(new Set([...result.items, ...second.items].map((item) => item.userId))).toEqual(new Set([ids.terms, ids.profile, ids.deferred, ids.missing]));
    expect(result.summary.bySignup).toMatchObject({ incomplete: 4, terms_required: 1, profile_required: 2, profile_deferred: 1, required_complete: 1, onboarding_complete: 1 });
    expect(result.summary.byProvider).toEqual({ email: 0, kakao: 3, apple: 2 });
    expect(result.summary.signupTotal).toBe(5);
    expect(result.summary.providerTotal).toBe(4);
  });

  it('completed is a subset of required-complete and an unlinked provider does not match', async () => {
    const result = await service.listUsers(actor, { q: prefix, status: 'active', signup: ['required_complete', 'onboarding_complete'] });
    expect(result.pageInfo.total).toBe(2);
    expect(new Set(result.items.map((item) => item.userId))).toEqual(new Set([ids.ready, ids.complete]));
    const apple = await service.listUsers(actor, { q: `${prefix}-complete`, providers: ['apple'] });
    expect(apple.items).toEqual([]);
    expect(apple.pageInfo.total).toBe(0);
  });

  it('keeps completed signup history when a withdrawn profile has been anonymized and soft-deleted', async () => {
    const result = await service.listUsers(actor, { q: prefix, status: 'deleted', signup: ['required_complete'] });
    expect(result.pageInfo.total).toBe(1);
    expect(result.items[0]).toMatchObject({ userId: ids.deleted, signupStage: 'onboarding_complete' });
    expect(result.summary.bySignup.incomplete).toBe(0);
  });
});
