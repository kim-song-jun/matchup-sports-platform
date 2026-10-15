import { ForbiddenException } from '@nestjs/common';
import { V1TournamentStaffRole } from '@prisma/client';
import { GAME_TAKEOVER_TOKEN_TTL_MS } from './game-takeover.service';
import type { GamesService } from './games.service';
import {
  createOrderingService, ORDERING_ADMIN_UPDATED_AT, ORDERING_GAME_ID,
  ORDERING_USER, orderingEvent,
} from './game-takeover.mdqa139-ordering.fixtures';

type TakeoverResult = Awaited<ReturnType<GamesService['requestTakeover']>>;

function settleRequest(promise: Promise<TakeoverResult>) {
  return promise.then(
    (grant) => ({ kind: 'granted', grant } as const),
    (error: unknown) => {
      if (!(error instanceof ForbiddenException)) throw error;
      return { kind: 'denied' } as const;
    },
  );
}

describe('MD-QA #139 takeover arrival order through actual GamesService', () => {
  afterEach(() => { jest.restoreAllMocks(); });

  it.each(['same-tab-remount', 'another-tab'])('keeps the newer acknowledged token renewable when an older %s actor lookup finishes later', async (client) => {
    // Given: R1 is awaiting the actual actor lookup while the same game receives R2.
    const fixture = await createOrderingService();
    const actor = fixture.holdNextActor();
    const old = settleRequest(fixture.service.requestTakeover(ORDERING_USER, ORDERING_GAME_ID,
      { clientInstanceId: 'original-tab', lastSequence: 7 }));
    await actor.entered;
    const clientInstanceId = client === 'same-tab-remount' ? 'original-tab' : 'new-tab';
    const newest = await fixture.service.requestTakeover(ORDERING_USER, ORDERING_GAME_ID,
      { clientInstanceId, lastSequence: 7 });
    try {
      // When: the abandoned R1 resumes after R2 has acknowledged its held lease.
      actor.release();
      await old;
      // Then: the actual server renewal accepts the token the new console holds.
      await expect(fixture.service.renewTakeover(ORDERING_USER, ORDERING_GAME_ID,
        { takeoverToken: newest.takeoverToken, clientInstanceId }))
        .resolves.toMatchObject({ takeoverToken: newest.takeoverToken, version: 3, lastSequence: 7 });
    } finally { actor.release(); await fixture.close(); }
  });

  it('persists the next actual append with the newer acknowledged token after the old actor lookup resumes', async () => {
    // Given: the new mounted console holds R2 while the unmounted console's R1 remains pending.
    const fixture = await createOrderingService();
    const actor = fixture.holdNextActor();
    const old = settleRequest(fixture.service.requestTakeover(ORDERING_USER, ORDERING_GAME_ID,
      { clientInstanceId: 'same-tab', lastSequence: 7 }));
    await actor.entered;
    const newest = await fixture.service.requestTakeover(ORDERING_USER, ORDERING_GAME_ID,
      { clientInstanceId: 'same-tab', lastSequence: 7 });
    actor.release();
    await old;
    const dto = orderingEvent(newest.takeoverToken, 'mdqa139-next-event');
    try {
      // When: the new console submits its next real command using ACK2's version and token.
      const result = await fixture.service.appendEvent(ORDERING_USER, ORDERING_GAME_ID, dto.clientEventId, dto);
      // Then: real command authorization, event persistence and version advancement succeed.
      expect(result).toMatchObject({ version: 4, sequence: 8, clientEventId: dto.clientEventId });
      expect(fixture.events).toHaveLength(1);
      expect(fixture.events[0]).toMatchObject({ actorUserId: ORDERING_USER.id, sequence: 8 });
    } finally { await fixture.close(); }
  });

  it('preserves a later different operator grant when the earlier operator authorization completes late', async () => {
    // Given: two authorized operators request the same game in arrival order R1, R2.
    const fixture = await createOrderingService();
    const actor = fixture.holdNextActor();
    const old = settleRequest(fixture.service.requestTakeover(ORDERING_USER, ORDERING_GAME_ID,
      { clientInstanceId: 'old-operator-tab', lastSequence: 7 }));
    await actor.entered;
    const nextUser = { ...ORDERING_USER, id: 'mdqa139-next-operator' };
    const newest = await fixture.service.requestTakeover(nextUser, ORDERING_GAME_ID,
      { clientInstanceId: 'next-operator-tab', lastSequence: 7 });
    try {
      // When: the older request's authorization finishes after the new operator's ACK.
      actor.release();
      await old;
      // Then: ownership remains with the later authorized operator and exact client.
      await expect(fixture.service.renewTakeover(nextUser, ORDERING_GAME_ID,
        { takeoverToken: newest.takeoverToken, clientInstanceId: 'next-operator-tab' }))
        .resolves.toMatchObject({ takeoverToken: newest.takeoverToken });
    } finally { actor.release(); await fixture.close(); }
  });

  it('allows the older authorized request to finish when the newer request is denied by real staff scope', async () => {
    // Given: an authorized pending request is followed by an unauthorized operator.
    const fixture = await createOrderingService();
    const actor = fixture.holdNextActor();
    const old = fixture.service.requestTakeover(ORDERING_USER, ORDERING_GAME_ID,
      { clientInstanceId: 'authorized-tab', lastSequence: 7 });
    await actor.entered;
    const deniedUser = { ...ORDERING_USER, id: 'mdqa139-denied-operator' };
    fixture.deniedUsers.add(deniedUser.id);
    await expect(fixture.service.requestTakeover(deniedUser, ORDERING_GAME_ID,
      { clientInstanceId: 'denied-tab', lastSequence: 7 })).rejects.toMatchObject({ status: 403 });
    try {
      // When: the earlier authorized actor lookup finishes.
      actor.release();
      const grant = await old;
      // Then: an unauthorized later request cannot cancel a legitimate pending grant.
      await expect(fixture.service.renewTakeover(ORDERING_USER, ORDERING_GAME_ID,
        { takeoverToken: grant.takeoverToken, clientInstanceId: 'authorized-tab' }))
        .resolves.toMatchObject({ takeoverToken: grant.takeoverToken });
    } finally { actor.release(); await fixture.close(); }
  });

  it('keeps different games independent while an earlier game authorization is pending', async () => {
    // Given: the first game's actor lookup is delayed and another game's request completes.
    const fixture = await createOrderingService();
    const actor = fixture.holdNextActor();
    const old = fixture.service.requestTakeover(ORDERING_USER, ORDERING_GAME_ID,
      { clientInstanceId: 'original-tab', lastSequence: 7 });
    await actor.entered;
    const other = await fixture.service.requestTakeover(ORDERING_USER, 'mdqa139-other-game',
      { clientInstanceId: 'other-tab', lastSequence: 7 });
    try {
      // When: the first game's request resumes.
      actor.release();
      const original = await old;
      // Then: both actual renewals retain their separate game's holder.
      await expect(fixture.service.renewTakeover(ORDERING_USER, ORDERING_GAME_ID,
        { takeoverToken: original.takeoverToken, clientInstanceId: 'original-tab' }))
        .resolves.toMatchObject({ gameId: ORDERING_GAME_ID, takeoverToken: original.takeoverToken });
      await expect(fixture.service.renewTakeover(ORDERING_USER, 'mdqa139-other-game',
        { takeoverToken: other.takeoverToken, clientInstanceId: 'other-tab' }))
        .resolves.toMatchObject({ gameId: 'mdqa139-other-game', takeoverToken: other.takeoverToken });
    } finally { actor.release(); await fixture.close(); }
  });

  it('preserves real field-operator assignment scope and rejects support-readonly takeover', async () => {
    // Given: staff assignments enter the actual tournament authorization matrix.
    const fixture = await createOrderingService();
    const staff = { ...ORDERING_USER, id: 'mdqa139-field-operator' };
    const support = { ...ORDERING_USER, id: 'mdqa139-support' };
    fixture.staffRoles.set(staff.id, V1TournamentStaffRole.FIELD_OPERATOR);
    fixture.staffRoles.set(support.id, V1TournamentStaffRole.SUPPORT_READONLY);
    try {
      // When: both roles request takeover for the assigned fixture.
      const grant = await fixture.service.requestTakeover(staff, ORDERING_GAME_ID,
        { clientInstanceId: 'staff-tab', lastSequence: 7 });
      // Then: only the authorized assignment may acquire and renew the lease.
      await expect(fixture.service.requestTakeover(support, ORDERING_GAME_ID,
        { clientInstanceId: 'support-tab', lastSequence: 7 })).rejects.toMatchObject({ status: 403 });
      await expect(fixture.service.renewTakeover(staff, ORDERING_GAME_ID,
        { takeoverToken: grant.takeoverToken, clientInstanceId: 'staff-tab' }))
        .resolves.toMatchObject({ takeoverToken: grant.takeoverToken, version: 3, lastSequence: 7 });
    } finally { await fixture.close(); }
  });

  it('still binds renewals to the exact client and expires the token at its existing TTL', async () => {
    // Given: an acknowledged actual grant has a fixed clock and exact client binding.
    const fixture = await createOrderingService();
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const grant = await fixture.service.requestTakeover(ORDERING_USER, ORDERING_GAME_ID,
      { clientInstanceId: 'held-tab', lastSequence: 7 });
    try {
      // When: a different client renews, then the real TTL elapses.
      await expect(fixture.service.renewTakeover(ORDERING_USER, ORDERING_GAME_ID,
        { takeoverToken: grant.takeoverToken, clientInstanceId: 'wrong-tab' })).rejects.toMatchObject({ status: 403 });
      jest.spyOn(Date, 'now').mockReturnValue(now + GAME_TAKEOVER_TOKEN_TTL_MS);
      // Then: the original token is rejected at expiry and remains tied to its subject.
      await expect(fixture.service.renewTakeover(ORDERING_USER, ORDERING_GAME_ID,
        { takeoverToken: grant.takeoverToken, clientInstanceId: 'held-tab' })).rejects.toMatchObject({ status: 403 });
      expect(fixture.takeover.validate({ gameId: ORDERING_GAME_ID, token: grant.takeoverToken,
        authorizationSubject: `platform_ops:${ORDERING_USER.id}@${ORDERING_ADMIN_UPDATED_AT.getTime()}` })).toBe(false);
    } finally { await fixture.close(); }
  });

  it('denies the older request when its final game metadata read resumes after a newer acknowledged grant', async () => {
    // Given: R1 completed authorization but its final database read is pending.
    const fixture = await createOrderingService();
    const metadata = fixture.holdNextMetadata();
    const old = settleRequest(fixture.service.requestTakeover(ORDERING_USER, ORDERING_GAME_ID,
      { clientInstanceId: 'same-tab', lastSequence: 7 }));
    await metadata.entered;
    try {
      // When: R2 is acknowledged before R1's last await completes.
      const newest = await fixture.service.requestTakeover(ORDERING_USER, ORDERING_GAME_ID,
        { clientInstanceId: 'same-tab', lastSequence: 7 });
      metadata.release();
      // Then: R1 cannot return a grant that silently invalidates ACK2's lease.
      expect(await old).toMatchObject({ kind: 'denied' });
      await expect(fixture.service.renewTakeover(ORDERING_USER, ORDERING_GAME_ID,
        { takeoverToken: newest.takeoverToken, clientInstanceId: 'same-tab' }))
        .resolves.toMatchObject({ takeoverToken: newest.takeoverToken });
    } finally { metadata.release(); await fixture.close(); }
  });

  it.each(['expiry', 'revoke'])('never revives an older pending request after the newer grant is removed by %s', async (removal) => {
    // Given: an old actor lookup remains pending across a later successful grant.
    const fixture = await createOrderingService();
    const actor = fixture.holdNextActor();
    const old = fixture.service.requestTakeover(ORDERING_USER, ORDERING_GAME_ID,
      { clientInstanceId: 'old-tab', lastSequence: 7 });
    await actor.entered;
    try {
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);
      const newest = await fixture.service.requestTakeover(ORDERING_USER, ORDERING_GAME_ID,
        { clientInstanceId: 'new-tab', lastSequence: 7 });
      // When: the newer lease expires or is revoked before old authorization finishes.
      if (removal === 'expiry') jest.spyOn(Date, 'now').mockReturnValue(now + GAME_TAKEOVER_TOKEN_TTL_MS);
      else fixture.takeover.revoke(ORDERING_GAME_ID);
      actor.release();
      // Then: stale denial stays distinct from expired-token automatic reacquisition.
      await expect(old).rejects.toMatchObject({ response: { code: 'TAKEOVER_SUPERSEDED' } });
      expect(fixture.takeover.validate({ gameId: ORDERING_GAME_ID, token: newest.takeoverToken,
        authorizationSubject: `platform_ops:${ORDERING_USER.id}@${ORDERING_ADMIN_UPDATED_AT.getTime()}` })).toBe(false);
      const fresh = await fixture.service.requestTakeover(ORDERING_USER, ORDERING_GAME_ID,
        { clientInstanceId: 'fresh-tab', lastSequence: 7 });
      await expect(fixture.service.renewTakeover(ORDERING_USER, ORDERING_GAME_ID,
        { takeoverToken: fresh.takeoverToken, clientInstanceId: 'fresh-tab' }))
        .resolves.toMatchObject({ takeoverToken: fresh.takeoverToken });
    } finally { actor.release(); await fixture.close(); }
  });

  it('releases a failed metadata reservation without invalidating an older authorized pending request', async () => {
    // Given: R1 is pending while R2 reserves a trusted internal ticket.
    const fixture = await createOrderingService();
    const actor = fixture.holdNextActor();
    const old = fixture.service.requestTakeover(ORDERING_USER, ORDERING_GAME_ID,
      { clientInstanceId: 'authorized-tab', lastSequence: 7 });
    await actor.entered;
    const reservation = fixture.takeover.reserveRequest(ORDERING_GAME_ID);
    const failure = new Error('Synthetic final metadata read failure');
    fixture.failNextMetadata(failure);
    try {
      // When: R2 fails its last database read before any actual grant is issued.
      await expect(fixture.service.requestTakeover(ORDERING_USER, ORDERING_GAME_ID,
        { clientInstanceId: 'failed-tab', lastSequence: 7 }, reservation)).rejects.toBe(failure);
      expect(fixture.takeover.grant({ gameId: ORDERING_GAME_ID,
        authorizationSubject: `platform_ops:${ORDERING_USER.id}@${ORDERING_ADMIN_UPDATED_AT.getTime()}`,
        clientInstanceId: 'failed-tab', lastSequence: 7 }, reservation)).toBeNull();
      actor.release();
      const grant = await old;
      // Then: the failed ticket is unusable and does not advance the successful watermark.
      await expect(fixture.service.renewTakeover(ORDERING_USER, ORDERING_GAME_ID,
        { takeoverToken: grant.takeoverToken, clientInstanceId: 'authorized-tab' }))
        .resolves.toMatchObject({ takeoverToken: grant.takeoverToken });
    } finally { actor.release(); await fixture.close(); }
  });
});
