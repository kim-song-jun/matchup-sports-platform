import { GAME_TAKEOVER_TOKEN_TTL_MS, GameTakeoverService } from './game-takeover.service';

describe('GameTakeoverService (Task 20 exclusive takeover grants)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('grants a fresh 256-bit-hex token bound to the game, subject, and client instance', () => {
    const service = new GameTakeoverService();
    const grant = service.grant({
      gameId: 'game-1',
      authorizationSubject: 'assignment:a1@1',
      clientInstanceId: 'client-1',
      lastSequence: 3,
    });

    expect(grant.token).toMatch(/^[a-f0-9]{64}$/);
    expect(grant.gameId).toBe('game-1');
    expect(grant.lastSequence).toBe(3);
    expect(
      service.validate({
        gameId: 'game-1',
        token: grant.token,
        authorizationSubject: 'assignment:a1@1',
      }),
    ).toBe(true);
  });

  it('rejects validation against the wrong game, wrong token, or wrong authorization subject', () => {
    const service = new GameTakeoverService();
    const grant = service.grant({
      gameId: 'game-1',
      authorizationSubject: 'assignment:a1@1',
      clientInstanceId: 'client-1',
      lastSequence: 0,
    });

    expect(
      service.validate({ gameId: 'other-game', token: grant.token, authorizationSubject: 'assignment:a1@1' }),
    ).toBe(false);
    expect(
      service.validate({ gameId: 'game-1', token: 'wrong-token', authorizationSubject: 'assignment:a1@1' }),
    ).toBe(false);
    expect(
      service.validate({ gameId: 'game-1', token: grant.token, authorizationSubject: 'assignment:other@1' }),
    ).toBe(false);
  });

  it('a fresh grant is exclusive: it atomically supersedes and invalidates the prior token for the same game', () => {
    const service = new GameTakeoverService();
    const first = service.grant({
      gameId: 'game-1',
      authorizationSubject: 'assignment:a1@1',
      clientInstanceId: 'client-1',
      lastSequence: 0,
    });
    const second = service.grant({
      gameId: 'game-1',
      authorizationSubject: 'assignment:a2@1',
      clientInstanceId: 'client-2',
      lastSequence: 1,
    });

    expect(second.token).not.toBe(first.token);
    expect(
      service.validate({ gameId: 'game-1', token: first.token, authorizationSubject: 'assignment:a1@1' }),
    ).toBe(false);
    expect(
      service.validate({ gameId: 'game-1', token: second.token, authorizationSubject: 'assignment:a2@1' }),
    ).toBe(true);
  });

  it('renews the held token, extending expiry, only for the exact (game, token, subject, clientInstance) tuple', () => {
    const service = new GameTakeoverService();
    const grant = service.grant({
      gameId: 'game-1',
      authorizationSubject: 'assignment:a1@1',
      clientInstanceId: 'client-1',
      lastSequence: 0,
    });

    expect(
      service.renew({
        gameId: 'game-1',
        token: grant.token,
        authorizationSubject: 'assignment:a1@1',
        clientInstanceId: 'wrong-client',
      }),
    ).toBeNull();
    expect(
      service.renew({
        gameId: 'game-1',
        token: 'wrong-token',
        authorizationSubject: 'assignment:a1@1',
        clientInstanceId: 'client-1',
      }),
    ).toBeNull();

    const renewed = service.renew({
      gameId: 'game-1',
      token: grant.token,
      authorizationSubject: 'assignment:a1@1',
      clientInstanceId: 'client-1',
    });
    expect(renewed).not.toBeNull();
    expect(renewed?.token).toBe(grant.token);
    expect(renewed?.expiresAt).toBeGreaterThanOrEqual(grant.expiresAt);
    expect(
      service.validate({ gameId: 'game-1', token: grant.token, authorizationSubject: 'assignment:a1@1' }),
    ).toBe(true);
  });

  it('expires the token after 90 seconds so a five-minute offline gap forces a fresh grant (reacquire), and renewal within the window keeps it alive', () => {
    const service = new GameTakeoverService();
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const grant = service.grant({
      gameId: 'game-1',
      authorizationSubject: 'assignment:a1@1',
      clientInstanceId: 'client-1',
      lastSequence: 0,
    });

    // Renew at +60s, comfortably inside the 90s window: still valid.
    jest.spyOn(Date, 'now').mockReturnValue(now + 60_000);
    const renewed = service.renew({
      gameId: 'game-1',
      token: grant.token,
      authorizationSubject: 'assignment:a1@1',
      clientInstanceId: 'client-1',
    });
    expect(renewed).not.toBeNull();

    // A five-minute offline gap with no renewal in between: the token is expired.
    jest.spyOn(Date, 'now').mockReturnValue(now + 60_000 + GAME_TAKEOVER_TOKEN_TTL_MS + 1);
    expect(
      service.validate({ gameId: 'game-1', token: grant.token, authorizationSubject: 'assignment:a1@1' }),
    ).toBe(false);
    expect(
      service.renew({
        gameId: 'game-1',
        token: grant.token,
        authorizationSubject: 'assignment:a1@1',
        clientInstanceId: 'client-1',
      }),
    ).toBeNull();

    // The client must reacquire: a fresh grant for the same subject succeeds again.
    const reacquired = service.grant({
      gameId: 'game-1',
      authorizationSubject: 'assignment:a1@1',
      clientInstanceId: 'client-1',
      lastSequence: 4,
    });
    expect(
      service.validate({ gameId: 'game-1', token: reacquired.token, authorizationSubject: 'assignment:a1@1' }),
    ).toBe(true);
  });

  it('revoke evicts any active grant for the game', () => {
    const service = new GameTakeoverService();
    const grant = service.grant({
      gameId: 'game-1',
      authorizationSubject: 'assignment:a1@1',
      clientInstanceId: 'client-1',
      lastSequence: 0,
    });
    service.revoke('game-1');
    expect(
      service.validate({ gameId: 'game-1', token: grant.token, authorizationSubject: 'assignment:a1@1' }),
    ).toBe(false);
  });
});
