import { buildDeletedProviderUserKey, finalizeAccountDeletion } from './final-account-deletion';

// Invented member numbers: they never match a real Kakao account.
const KAKAO_KEY = '9000000001';
// Digit-only keys on other providers: only the provider check keeps these out of the Kakao targets.
const APPLE_DIGITS_KEY = '9000000002';
const NAVER_DIGITS_KEY = '9000000003';
const USER_ID = 'user-1';

type IdentityRow = { id: string; provider: 'kakao' | 'naver' | 'apple' | 'email'; providerUserKey: string };

function fakeTransaction(identities: IdentityRow[]) {
  const stored = identities.map((row) => ({ ...row }));
  const update = jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<IdentityRow> }) => {
    Object.assign(stored.find((row) => row.id === where.id) as IdentityRow, data);
  });
  const tx = {
    v1User: { update: jest.fn().mockResolvedValue({ accountStatus: 'deleted' }) },
    v1TeamMembership: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
    v1TournamentPlayer: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    v1Team: { update: jest.fn() },
    v1AuthIdentity: { findMany: jest.fn(async () => stored.map((row) => ({ ...row }))), update },
    v1UserProfile: { updateMany: jest.fn() },
    v1UserRecordConsent: { updateMany: jest.fn() },
    v1PushSubscription: { deleteMany: jest.fn() },
    v1PushDevice: { deleteMany: jest.fn() },
    v1ChatUserBlock: { deleteMany: jest.fn() },
    v1UserRegion: { deleteMany: jest.fn() },
    v1UserSportPreference: { deleteMany: jest.fn() },
    v1SearchHistory: { deleteMany: jest.fn() },
    v1VerificationToken: { deleteMany: jest.fn() },
    v1UserOnboardingProgress: { updateMany: jest.fn() },
    v1AdminActionLog: { create: jest.fn() },
    v1StatusChangeLog: { create: jest.fn().mockResolvedValue({ id: 'status-log-1' }) },
    $executeRaw: jest.fn().mockResolvedValue(1),
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
  return { tx, stored };
}

const finalize = (tx: ReturnType<typeof fakeTransaction>['tx']) =>
  finalizeAccountDeletion(tx as never, {
    target: { id: USER_ID, accountStatus: 'withdrawal_pending', email: 'a@example.test', phone: null, deletedAt: null },
    actor: { type: 'system' },
    reason: 'withdrawal_grace_elapsed',
    deletedAt: new Date('2026-11-14T00:00:00Z'),
  });

describe('finalizeAccountDeletion — Kakao unlink targets', () => {
  it('hands back the Kakao login row and its member number as they were before the key is replaced', async () => {
    const { tx, stored } = fakeTransaction([
      { id: 'identity-kakao', provider: 'kakao', providerUserKey: KAKAO_KEY },
      { id: 'identity-apple', provider: 'apple', providerUserKey: APPLE_DIGITS_KEY },
      { id: 'identity-naver', provider: 'naver', providerUserKey: NAVER_DIGITS_KEY },
      { id: 'identity-email', provider: 'email', providerUserKey: 'a@example.test' },
    ]);

    const result = await finalize(tx);

    expect(result.kakaoUnlinkTargets).toEqual([{ identityId: 'identity-kakao', memberNumber: KAKAO_KEY }]);
    expect(stored.find((row) => row.id === 'identity-kakao')?.providerUserKey).toBe(buildDeletedProviderUserKey(USER_ID, 'identity-kakao'));
    expect(JSON.stringify(stored)).not.toContain(KAKAO_KEY);
  });

  it('hands back nothing for an account without a Kakao login', async () => {
    const { tx } = fakeTransaction([
      { id: 'identity-apple', provider: 'apple', providerUserKey: APPLE_DIGITS_KEY },
      { id: 'identity-naver', provider: 'naver', providerUserKey: NAVER_DIGITS_KEY },
      { id: 'identity-email', provider: 'email', providerUserKey: 'a@example.test' },
    ]);

    const result = await finalize(tx);

    expect(result.kakaoUnlinkTargets).toEqual([]);
  });

  it('leaves out a Kakao row whose key is already a placeholder', async () => {
    const { tx } = fakeTransaction([
      { id: 'identity-old', provider: 'kakao', providerUserKey: buildDeletedProviderUserKey(USER_ID, 'identity-old') },
      { id: 'identity-kakao', provider: 'kakao', providerUserKey: KAKAO_KEY },
    ]);

    const result = await finalize(tx);

    expect(result.kakaoUnlinkTargets).toEqual([{ identityId: 'identity-kakao', memberNumber: KAKAO_KEY }]);
  });
});
