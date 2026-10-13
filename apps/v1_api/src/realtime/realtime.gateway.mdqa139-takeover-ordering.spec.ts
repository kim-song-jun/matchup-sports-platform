import {
  ORDERING_GAME_ID, ORDERING_USER, orderingEvent,
} from '../games/game-takeover.mdqa139-ordering.fixtures';
import { createGatewayOrderingFixture } from './realtime.gateway.mdqa139-takeover-ordering.fixtures';

describe('MD-QA 139 gateway takeover arrival order before profile authorization', () => {
  it.each([
    { clientInstanceId: 'same-tab', user: ORDERING_USER, scenario: 'same client remount' },
    { clientInstanceId: 'new-tab', user: ORDERING_USER, scenario: 'another client' },
    { clientInstanceId: 'operator-tab', user: { ...ORDERING_USER, id: 'new-operator' }, scenario: 'another operator' },
  ])('preserves the acknowledged newer grant after a delayed profile lookup: $scenario', async ({ user, clientInstanceId }) => {
    // Given: R1 entered the actual gateway but its first profile database await is pending.
    const fixture = await createGatewayOrderingFixture();
    const profile = fixture.holdNextProfile();
    const old = fixture.request();
    await profile.entered;
    try {
      // When: R2 obtains a real grant before R1's profile lookup resumes.
      const latest = await fixture.request(user, clientInstanceId);
      expect(latest.status).toBe('granted');
      if (latest.status !== 'granted') throw new TypeError('The newer request did not acquire the game');
      profile.release();
      // Then: R1 is superseded and R2 can renew and commit an actual event.
      expect(await old).toEqual({ status: 'denied', code: 'TAKEOVER_SUPERSEDED' });
      await expect(fixture.service.renewTakeover(user, ORDERING_GAME_ID,
        { takeoverToken: latest.takeoverToken, clientInstanceId }))
        .resolves.toMatchObject({ takeoverToken: latest.takeoverToken });
      const event = orderingEvent(latest.takeoverToken, `gateway-${clientInstanceId}`);
      await expect(fixture.service.appendEvent(user, ORDERING_GAME_ID, event.clientEventId, event))
        .resolves.toMatchObject({ version: 4, sequence: 8, clientEventId: event.clientEventId });
      expect(fixture.pendingOrderCount()).toBe(0);
    } finally { profile.release(); await old; await fixture.close(); }
  });

  it('allows an older authorized request after a newer request fails real actor authorization', async () => {
    // Given: an authorized R1 waits on its profile lookup and R2 has no operator role.
    const fixture = await createGatewayOrderingFixture();
    const profile = fixture.holdNextProfile();
    const old = fixture.request();
    await profile.entered;
    const denied = { ...ORDERING_USER, id: 'denied-new-operator' };
    fixture.deniedUsers.add(denied.id);
    try {
      // When: R2 fails the actual GamesService authorization before R1 resumes.
      expect(await fixture.request(denied, 'denied-tab')).toMatchObject({ status: 'denied', code: 'STAFF_SCOPE_DENIED' });
      profile.release();
      const legitimate = await old;
      // Then: a failed newer request cannot suppress an authorized pending holder.
      expect(legitimate.status).toBe('granted');
      if (legitimate.status !== 'granted') throw new TypeError('The legitimate request was denied');
      await expect(fixture.service.renewTakeover(ORDERING_USER, ORDERING_GAME_ID,
        { takeoverToken: legitimate.takeoverToken, clientInstanceId: 'same-tab' }))
        .resolves.toMatchObject({ takeoverToken: legitimate.takeoverToken });
      expect(fixture.pendingOrderCount()).toBe(0);
    } finally { profile.release(); await old; await fixture.close(); }
  });

  it('reserves before the first profile await and releases the reservation on profile denial', async () => {
    // Given: the actual profile policy will deny the user after a controlled database wait.
    const fixture = await createGatewayOrderingFixture();
    fixture.blockedUsers.add(ORDERING_USER.id);
    const profile = fixture.holdNextProfile();
    const pending = fixture.request();
    await profile.entered;
    const pendingBeforeRelease = fixture.pendingOrderCount();
    try {
      // When: the deferred profile result reaches the gateway's denial branch.
      profile.release();
      expect(await pending).toEqual({ status: 'denied', code: 'ACTIVITY_PROFILE_REQUIRED' });
      // Then: first-await arrival tracking existed and the denied request leaves no retained order.
      expect(pendingBeforeRelease).toBe(1);
      expect(fixture.pendingOrderCount()).toBe(0);
    } finally { profile.release(); await pending; await fixture.close(); }
  });

  it('releases the pre-await reservation while propagating an unexpected profile database failure', async () => {
    // Given: the gateway is waiting on its first database read, which will fail.
    const fixture = await createGatewayOrderingFixture();
    fixture.failNextProfile(new Error('synthetic-profile-database-failure'));
    const profile = fixture.holdNextProfile();
    const pending = fixture.request().then(
      (result) => ({ kind: 'fulfilled' as const, result }),
      (error: unknown) => ({ kind: 'rejected' as const, error }),
    );
    await profile.entered;
    const pendingBeforeRelease = fixture.pendingOrderCount();
    try {
      // When: the database failure resumes the handler.
      profile.release();
      const outcome = await pending;
      // Then: no success is fabricated and every pending order is released.
      expect(outcome).toMatchObject({ kind: 'rejected', error: new Error('synthetic-profile-database-failure') });
      expect(pendingBeforeRelease).toBe(1);
      expect(fixture.pendingOrderCount()).toBe(0);
    } finally { profile.release(); await pending; await fixture.close(); }
  });
});
