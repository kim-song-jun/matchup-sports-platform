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

  /**
   * 백로그 결함 수정(realtime-takeover-and-eviction-protocol) — 근본 원인:
   * `renew()`가 실패 사유를 전부 `null` 하나로 뭉개서, 호출자(게이트웨이)가
   * "다른 콘솔이 아직 살아있는 grant를 방금 새로 쥐었다(=넘겨받음, superseded)"
   * 와 "아무도 안 쥐고 있고 내 토큰이 그냥 TTL을 넘겼다(=자연 만료)"를 구분할
   * 수 없었다. 구분이 없으니 클라이언트의 자동 재획득 effect가 두 경우를 똑같이
   * 취급해, 두 콘솔이 20초 renew 주기로 서로의 토큰을 영원히 되찾는 핑퐁이
   * 났다. `isSuperseded()`는 그 구분 자체를 담당한다.
   */
  describe('isSuperseded — 다른 콘솔에 뺏김(자동 재획득 금지) vs 자연 만료(재획득 안전)를 구분한다', () => {
    it('아직 살아있는(만료 전) 다른 토큰이 현재 이 게임을 쥐고 있으면 true', () => {
      const service = new GameTakeoverService();
      service.grant({
        gameId: 'game-1',
        authorizationSubject: 'assignment:a1@1',
        clientInstanceId: 'client-1',
        lastSequence: 0,
      });
      // 대회 디렉터가 같은 fixture 콘솔을 열어 필드 담당자의 토큰을 덮어썼다.
      service.grant({
        gameId: 'game-1',
        authorizationSubject: 'assignment:a2@1',
        clientInstanceId: 'client-2',
        lastSequence: 0,
      });

      // 필드 담당자가 여전히 들고 있는 것은 방금 덮어써진 옛 토큰이다.
      expect(service.isSuperseded('game-1', 'the-old-overwritten-token')).toBe(true);
    });

    it('아무도 안 쥐고 있고(자연 만료) 다른 토큰도 없으면 false — 재획득은 안전하다', () => {
      const service = new GameTakeoverService();
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);
      const grant = service.grant({
        gameId: 'game-1',
        authorizationSubject: 'assignment:a1@1',
        clientInstanceId: 'client-1',
        lastSequence: 0,
      });

      // 아무도 재획득하지 않은 채 TTL을 넘겼다 — 그대로 자기 자신의 (같은) 토큰이
      // 남아 있을 뿐, 아무도 그 게임을 쥐고 있지 않다.
      jest.spyOn(Date, 'now').mockReturnValue(now + GAME_TAKEOVER_TOKEN_TTL_MS + 1);
      expect(service.isSuperseded('game-1', grant.token)).toBe(false);
    });

    it('그 게임에 grant가 아예 없으면(revoke 등) false', () => {
      const service = new GameTakeoverService();
      expect(service.isSuperseded('game-1', 'any-token')).toBe(false);
    });

    it('내가 방금 renew에 성공해 최신 토큰을 들고 있으면(=뺏기지 않음) false', () => {
      const service = new GameTakeoverService();
      const grant = service.grant({
        gameId: 'game-1',
        authorizationSubject: 'assignment:a1@1',
        clientInstanceId: 'client-1',
        lastSequence: 0,
      });
      expect(service.isSuperseded('game-1', grant.token)).toBe(false);
    });
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
