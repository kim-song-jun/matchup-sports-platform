import { writeIdentityAttestDecisionNotification } from './identity-attest-notification';

/**
 * 감사 결함 수정(2026-08-27) — 신원 연결 신청의 승인·거절 결과가 신청자에게 어떤
 * 경로로도 통보되지 않던 결함(games.service.ts attestIdentityLink)의 계약을 고정한다.
 * 승인함 목록(listPendingIdentityLinkRequests)이 `event.userId !== user.id` 로 본인 신청을
 * 명시적으로 제외하므로, 이 알림이 신청자가 결정을 알 수 있는 유일한 경로다. 특히 거절은
 * 24시간 만료 잡(identity-link-expiry.service.ts)도 종결 이벤트가 있으면 no-op 하므로
 * 이 알림이 없으면 완전한 침묵이었다.
 */
describe('writeIdentityAttestDecisionNotification', () => {
  function makeTx(overrides: {
    game: unknown;
    participant?: unknown;
    preference?: unknown;
    existing?: unknown;
  }) {
    return {
      v1Game: { findUnique: jest.fn().mockResolvedValue(overrides.game) },
      v1GameParticipant: {
        findFirst: jest
          .fn()
          .mockResolvedValue(overrides.participant ?? { displayNameSnapshot: '김민준' }),
      },
      v1NotificationPreference: {
        findUnique: jest.fn().mockResolvedValue(overrides.preference ?? null),
      },
      v1Notification: {
        findUnique: jest.fn().mockResolvedValue(overrides.existing ?? null),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
  }

  it('승인: 신청자에게 businessKey 멱등으로 알림을 남기고 커밋 뒤 푸시 plan 을 돌려준다', async () => {
    const tx = makeTx({
      game: { sourceType: 'TEAM_MATCH', teamMatchId: 'tm-1', tournamentFixture: null },
    });

    const plan = await writeIdentityAttestDecisionNotification(tx as never, {
      gameId: 'game-1',
      participantId: 'p-1',
      requestId: 'req-1',
      requesterUserId: 'requester',
      decision: 'approve',
    });

    expect(tx.v1Notification.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          recipientUserId: 'requester',
          targetType: 'team_match',
          targetId: 'tm-1',
          deepLink: '/team-matches/tm-1',
          businessKey: 'identity-attest-decision:req-1:requester',
        }),
      ],
      skipDuplicates: true,
    });
    expect(plan).toEqual({
      recipientUserId: 'requester',
      title: '기록 연결이 승인됐어요',
      body: expect.stringContaining('김민준'),
      url: '/team-matches/tm-1',
    });
  });

  it('거절: 사유가 있으면 본문에 담기고, 다시 신청할 수 있다는 안내를 포함한다', async () => {
    const tx = makeTx({
      game: {
        sourceType: 'TOURNAMENT_FIXTURE',
        teamMatchId: null,
        tournamentFixture: { id: 'fx-1', tournamentId: 't-1' },
      },
    });

    const plan = await writeIdentityAttestDecisionNotification(tx as never, {
      gameId: 'game-1',
      participantId: 'p-1',
      requestId: 'req-2',
      requesterUserId: 'requester',
      decision: 'reject',
      reason: '등번호가 달라요',
    });

    expect(plan?.title).toBe('기록 연결이 거절됐어요');
    expect(plan?.body).toContain('등번호가 달라요');
    expect(plan?.body).toContain('다시 신청할 수 있어요');
    expect(plan?.url).toBe('/tournaments/t-1/matches/fx-1');
  });

  it('선호도(teamMatchEnabled=false)로 꺼둔 신청자에게는 남기지 않는다', async () => {
    const tx = makeTx({
      game: { sourceType: 'TEAM_MATCH', teamMatchId: 'tm-1', tournamentFixture: null },
      preference: { activityEnabled: true, teamMatchEnabled: false },
    });

    const plan = await writeIdentityAttestDecisionNotification(tx as never, {
      gameId: 'game-1',
      participantId: 'p-1',
      requestId: 'req-3',
      requesterUserId: 'requester',
      decision: 'approve',
    });

    expect(plan).toBeNull();
    expect(tx.v1Notification.createMany).not.toHaveBeenCalled();
  });

  it('이미 배달된 결정(재시도)이면 알림은 skipDuplicates 로 남기되 푸시 plan 은 null 이다', async () => {
    const tx = makeTx({
      game: { sourceType: 'TEAM_MATCH', teamMatchId: 'tm-1', tournamentFixture: null },
      existing: { id: 'notif-1' },
    });

    const plan = await writeIdentityAttestDecisionNotification(tx as never, {
      gameId: 'game-1',
      participantId: 'p-1',
      requestId: 'req-4',
      requesterUserId: 'requester',
      decision: 'approve',
    });

    expect(tx.v1Notification.createMany).toHaveBeenCalled();
    expect(plan).toBeNull();
  });
});
