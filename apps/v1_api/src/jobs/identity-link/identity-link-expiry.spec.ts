import {
  IDENTITY_LINK_REQUEST_TTL_MS,
  IdentityLinkExpiryService,
  scheduleIdentityLinkExpiry,
} from './identity-link-expiry.service';

/**
 * 24시간 만료의 **능동 처리**(2026-08-26) 계약을 고정한다.
 *
 * 이전에는 만료가 lazy 였다 — 누가 attest 를 시도할 때에야 EXPIRED 가 쓰였고, 아무도
 * 손대지 않으면 원장에 REQUESTED 만 남은 채 화면에서만 조용히 사라졌다. 이 잡이 그 결말을
 * 확정하고 신청자에게 통보한다. 여기서 검증하는 것:
 *  - 이미 종결된 요청(승인/거절/lazy 만료)에는 아무것도 쓰지 않는다 — 이중 기록 방지.
 *  - 아직 24시간이 안 됐으면 쓰지 않는다(잡이 일찍 깨는 경우).
 *  - 만료 시 EXPIRED 이벤트 + 게임 버전 증가 + 신청자 알림이 함께 간다.
 */
describe('IdentityLinkExpiryService', () => {
  const requestedAt = new Date(Date.now() - IDENTITY_LINK_REQUEST_TTL_MS - 60_000);
  const claim = {
    payload: { gameId: 'game-1', participantId: 'p-1', requestId: 'req-1' },
  } as never;

  function makeTx(overrides: { events: unknown[]; existingNotification?: unknown }) {
    return {
      v1ParticipantIdentityLinkEvent: {
        findMany: jest.fn().mockResolvedValue(overrides.events),
        findFirst: jest.fn().mockResolvedValue({ eventVersion: 3 }),
        create: jest.fn().mockResolvedValue({}),
      },
      v1Game: {
        update: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue({
          sourceType: 'TEAM_MATCH',
          teamMatchId: 'tm-1',
          tournamentFixture: null,
        }),
      },
      v1GameParticipant: {
        findFirst: jest.fn().mockResolvedValue({ displayNameSnapshot: '김민준' }),
      },
      v1NotificationPreference: { findUnique: jest.fn().mockResolvedValue(null) },
      // TTL 재판정은 DB 시계(CURRENT_TIMESTAMP)로 한다 — 워커 시계가 뒤처져도 만료가
      // 영영 누락되지 않게 하기 위해서다.
      $queryRaw: jest.fn().mockResolvedValue([{ now: new Date() }]),
      v1Notification: {
        findUnique: jest.fn().mockResolvedValue(overrides.existingNotification ?? null),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
  }

  const requestedEvent = {
    action: 'REQUESTED',
    requestId: 'req-1',
    linkId: 'link-1',
    userId: 'requester',
    effectiveAt: requestedAt,
    eventVersion: 1,
  };

  it('만료된 요청에 EXPIRED 를 기록하고 게임 버전을 올린 뒤 신청자에게 통보한다', async () => {
    const tx = makeTx({ events: [requestedEvent] });
    const push = { sendToUser: jest.fn().mockResolvedValue({}) };

    await new IdentityLinkExpiryService(push as never).handler(claim, tx as never);

    expect(tx.v1ParticipantIdentityLinkEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        participantId: 'p-1',
        requestId: 'req-1',
        action: 'EXPIRED',
        actorType: 'SYSTEM',
        systemActor: 'IDENTITY_LINK_EXPIRY',
        // 신청자 본인이 userId 로 남는다(lazy expiry 경로와 같은 모양).
        userId: 'requester',
        eventVersion: 4,
      }),
    });
    expect(tx.v1Game.update).toHaveBeenCalledWith({
      where: { id: 'game-1' },
      data: { version: { increment: 1 } },
    });
    const [{ data }] = tx.v1Notification.createMany.mock.calls[0] as [
      { data: Array<{ recipientUserId: string; businessKey: string; deepLink: string | null }> },
    ];
    expect(data[0]).toMatchObject({
      recipientUserId: 'requester',
      businessKey: 'identity-attest-expired:req-1:requester',
      deepLink: '/team-matches/tm-1',
    });
    expect(push.sendToUser).toHaveBeenCalledWith('requester', expect.objectContaining({ title: '기록 연결 요청이 만료됐어요' }));
  });

  it.each([
    ['승인', 'ATTESTED'],
    ['거절', 'REJECTED'],
    ['이미 만료 기록됨', 'EXPIRED'],
  ])('%s된 요청에는 아무것도 쓰지 않는다', async (_label, terminalAction) => {
    const tx = makeTx({
      events: [requestedEvent, { ...requestedEvent, action: terminalAction, eventVersion: 2 }],
    });

    await new IdentityLinkExpiryService().handler(claim, tx as never);

    expect(tx.v1ParticipantIdentityLinkEvent.create).not.toHaveBeenCalled();
    expect(tx.v1Game.update).not.toHaveBeenCalled();
    expect(tx.v1Notification.createMany).not.toHaveBeenCalled();
  });

  it('아직 24시간이 지나지 않았으면 쓰지 않는다(잡이 일찍 깬 경우)', async () => {
    const tx = makeTx({ events: [{ ...requestedEvent, effectiveAt: new Date() }] });

    await new IdentityLinkExpiryService().handler(claim, tx as never);

    expect(tx.v1ParticipantIdentityLinkEvent.create).not.toHaveBeenCalled();
  });

  it('워커가 afterCommit 훅을 주면 푸시를 트랜잭션 안에서 보내지 않고 커밋 뒤로 미룬다', async () => {
    const tx = makeTx({ events: [requestedEvent] });
    const push = { sendToUser: jest.fn().mockResolvedValue({}) };
    const claimWithHook = {
      payload: { gameId: 'game-1', participantId: 'p-1', requestId: 'req-1' },
      afterCommit: [] as Array<() => void>,
    };

    await new IdentityLinkExpiryService(push as never).handler(claimWithHook as never, tx as never);

    // 핸들러가 끝난 시점(=아직 커밋 전)에는 발송되지 않아야 한다 — 트랜잭션이 뒤집히면
    // "만료되지 않은 요청"의 만료 알림이 나가기 때문이다.
    expect(push.sendToUser).not.toHaveBeenCalled();
    expect(claimWithHook.afterCommit).toHaveLength(1);

    claimWithHook.afterCommit[0]();
    expect(push.sendToUser).toHaveBeenCalledWith('requester', expect.objectContaining({ title: '기록 연결 요청이 만료됐어요' }));
  });

  it('재시도로 알림이 이미 있으면 푸시를 다시 보내지 않는다', async () => {
    const tx = makeTx({ events: [requestedEvent], existingNotification: { id: 'n-1' } });
    const push = { sendToUser: jest.fn().mockResolvedValue({}) };

    await new IdentityLinkExpiryService(push as never).handler(claim, tx as never);

    expect(push.sendToUser).not.toHaveBeenCalled();
  });

  it('신청자가 이 알림 축을 꺼 뒀으면 통보하지 않는다', async () => {
    const tx = makeTx({ events: [requestedEvent] });
    tx.v1NotificationPreference.findUnique.mockResolvedValue({
      teamMatchEnabled: false,
      activityEnabled: true,
    });

    await new IdentityLinkExpiryService().handler(claim, tx as never);

    // 만료 자체는 기록하되 통보만 건너뛴다 — 원장 정합성은 선호도와 무관하다.
    expect(tx.v1ParticipantIdentityLinkEvent.create).toHaveBeenCalled();
    expect(tx.v1Notification.createMany).not.toHaveBeenCalled();
  });

  it('신청과 같은 트랜잭션에서 요청 id 기준 멱등 키로 +24h 잡을 예약한다', async () => {
    const executeRaw = jest.fn().mockResolvedValue(1);
    await scheduleIdentityLinkExpiry({ $executeRaw: executeRaw } as never, {
      gameId: 'game-1',
      participantId: 'p-1',
      requestId: 'req-1',
      requestedAt: new Date('2026-08-26T00:00:00.000Z'),
    });

    const values = executeRaw.mock.calls[0].slice(1);
    expect(values).toContain('identity-link-expiry:req-1');
    expect(values).toContain('IDENTITY_LINK_EXPIRY');
    // available_at = 신청 시각 + 24h.
    expect(values).toContainEqual(new Date('2026-08-27T00:00:00.000Z'));
  });
});
