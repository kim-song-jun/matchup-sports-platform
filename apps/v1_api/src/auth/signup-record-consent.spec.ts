import { V1ConsentState } from '@prisma/client';
import { recordSignupConsent } from './signup-record-consent';
import { isParticipantPubliclyEligible } from '../games/public-records/public-consent';

describe('signup record visibility', () => {
  function store(initial?: { state: V1ConsentState; policyHash: string }) {
    let row = initial;
    const upsert = jest.fn(async ({ update, create }) => {
      row = row ? { ...row, ...update } : create;
      return row;
    });
    return { transaction: { v1UserRecordConsent: { upsert } } as never, read: () => row };
  }

  it('omitted signup preference persists a public default that passes the shared public-record gate', async () => {
    const db = store();
    await recordSignupConsent(db.transaction, 'new-user', undefined);
    expect(db.read()).toMatchObject({ state: 'GRANTED', policyHash: 'v1-public-record-default-2' });
    expect(isParticipantPubliclyEligible({
      participantId: 'participant', linkedUserId: 'new-user',
      userConsentState: db.read()?.state ?? null, latestParticipantSnapshotState: null,
    })).toBe(true);
    expect(isParticipantPubliclyEligible({
      participantId: 'hidden-participant', linkedUserId: 'new-user',
      userConsentState: db.read()?.state ?? null, latestParticipantSnapshotState: 'REVOKED',
    })).toBe(false);
  });

  it('default initialization never overwrites an explicit private preference, including deferred profile completion', async () => {
    const db = store({ state: V1ConsentState.REVOKED, policyHash: 'explicit-private' });
    await recordSignupConsent(db.transaction, 'existing-user', undefined);
    expect(db.read()).toMatchObject({ state: 'REVOKED', policyHash: 'explicit-private' });
  });

  it('older clients can still explicitly opt out during signup', async () => {
    const db = store();
    await recordSignupConsent(db.transaction, 'new-user', { granted: false, policyHash: 'explicit-private' });
    expect(db.read()).toMatchObject({ state: 'REVOKED', policyHash: 'explicit-private' });
  });
});
