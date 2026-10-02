import type { OperationAuditWriterService } from '../common/audit/operation-audit-writer.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { GameCommandContext } from './games.types';
import type { GameTakeoverService } from './game-takeover.service';
import { GamesService } from './games.service';

/**
 * 감사 결함 수정(2026-08-27) — `syncAssistsIntoSubmittedRevision`(private, `assignGoalAssist`
 * 가 어시스트를 사후 부착할 때 호출) 의 계약을 고정한다: SUBSTITUTION 없이 뛴 벤치 선수
 * (predecessor 리비전에 행이 없는 참가자)에게 사후 어시스트가 붙으면, 예전엔 diff 루프가
 * predecessorParticipants 만 순회해 그 참가자가 어디에도 안 걸리고 다른 선수의 어시스트가
 * 안 움직이면 `diffs`가 비어 이 메서드가 null 을 반환했다 — 어시스트가 이벤트 목록에는
 * 보이는데 공식 기록(V1GameResultParticipant, 개인 기록·선수 카드 PAS 가 읽는 테이블)에는
 * 영원히 반영되지 않았다. 이제 predecessor 에 없는 새 assist 대상마다 행을 새로 만든다.
 */
describe('GamesService.syncAssistsIntoSubmittedRevision (private, via assignGoalAssist)', () => {
  const gameId = 'game-1';
  const submittedAt = new Date('2026-08-20T10:00:00.000Z');

  function makeService() {
    const predecessor = {
      id: 'rev-1',
      gameId,
      revision: 1,
      state: 'SUBMITTED',
      score: { home: 1, away: 0 },
      goalEvents: [],
      eventsHash: 'hash-1',
      missingScorer: false,
      mvpParticipantId: null,
      outcomeReason: 'NORMAL',
      outcomeNote: null,
      submittedAt,
      supersedesId: null,
    };
    const successorDraft = {
      id: 'rev-2',
      gameId,
      revision: 2,
      state: 'DRAFT',
    };
    const submitted = {
      id: 'rev-2',
      gameId,
      revision: 2,
      state: 'SUBMITTED',
      submittedAt,
    };

    const tx = {
      v1GameResultRevision: {
        findFirst: jest.fn().mockResolvedValue(predecessor),
        create: jest.fn().mockResolvedValue(successorDraft),
        update: jest.fn().mockResolvedValue(submitted),
      },
      v1GameEvent: {
        findMany: jest.fn().mockResolvedValue([
          // p-scorer의 골에 어시스트가 붙어 있다 -- 어시스트 참가자(p-bench)는 SUBSTITUTION
          // 없이 뛴 벤치 선수라 predecessor 리비전에는 행이 아예 없다.
          {
            id: 'ev-goal-1',
            type: 'GOAL',
            participantId: 'p-scorer',
            assistParticipantId: 'p-bench',
            payload: {},
            reversesEventId: null,
          },
        ]),
      },
      v1GameResultParticipant: {
        // predecessor 행은 득점자(p-scorer)뿐 -- 어시스트가 0이라 이 값은 diff 를 만들지
        // 않는다(그래서 예전 버그는 diffs.length===0 으로 조용히 리턴했다).
        findMany: jest.fn().mockResolvedValue([
          {
            participantId: 'p-scorer',
            sideId: 's-h',
            started: true,
            minutesPlayed: 90,
            goals: 1,
            assists: 0,
            fouls: 0,
            cards: { yellow: 0, red: 0 },
            goalkeeper: false,
          },
        ]),
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      v1GameParticipant: {
        // 새로 assist 를 받은 벤치 선수의 원본 행 -- sideId/started/position 을 여기서 읽는다.
        findMany: jest.fn().mockResolvedValue([
          { id: 'p-bench', sideId: 's-h', started: false, position: 'FW' },
        ]),
      },
      v1Game: {
        findUnique: jest.fn().mockResolvedValue({ competitionConfigVersionId: 'cfg-1' }),
      },
      v1CompetitionConfigVersion: {
        findUnique: jest.fn().mockResolvedValue({ lineup: null }),
      },
      v1OutboxEvent: {
        create: jest.fn().mockResolvedValue({}),
      },
      $executeRaw: jest.fn().mockResolvedValue(0),
    };

    const service = new GamesService(
      {} as PrismaService,
      {} as OperationAuditWriterService,
      {} as GameTakeoverService,
    );
    return { service, tx, predecessor, successorDraft };
  }

  it('predecessor 에 없던 벤치 어시스트 대상도 새 리비전 참가자 행으로 만든다 (드롭되지 않는다)', async () => {
    const { service, tx } = makeService();
    const context: GameCommandContext = {
      actor: { actorType: 'SYSTEM', systemActor: 'GAME_END_DERIVER' },
      expectedVersion: 3,
      durableCommandId: 'cmd-1',
      payloadHash: 'hash',
    };

    const result = await (
      service as unknown as {
        syncAssistsIntoSubmittedRevision: (
          tx: unknown,
          gameId: string,
          context: GameCommandContext,
        ) => Promise<{
          revisionId: string;
          revision: number;
          participants: Array<{ participantId: string; assistsBefore: number; assistsAfter: number }>;
        } | null>;
      }
    ).syncAssistsIntoSubmittedRevision(tx, gameId, context);

    // 예전엔 여기서 null 이 나왔다 -- 다른 참가자의 어시스트가 안 움직였으므로 diffs 가
    // 비어 새 리비전 자체가 안 만들어졌다.
    expect(result).not.toBeNull();
    expect(result?.participants).toEqual([
      { participantId: 'p-bench', assistsBefore: 0, assistsAfter: 1 },
    ]);

    // 새 리비전에 p-scorer(승계) + p-bench(신규) 두 행이 실제로 저장된다.
    expect(tx.v1GameResultParticipant.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ participantId: 'p-scorer', assists: 0 }),
        expect.objectContaining({
          participantId: 'p-bench',
          resultRevisionId: 'rev-2',
          sideId: 's-h',
          // 정본 §3 이후 **true** 다. 예전엔 라인업의 `started`(=false, 후보)를 그대로
          // 실었지만 선발/후보 구분이 없어졌다 — 결과 행이 있다는 것 자체가 "뛰었다" 이고,
          // 이 사람은 실제로 어시스트를 기록했으니 출전자다. 이 단언이 red 로 돌아오면
          // 결과 리비전이 다시 라인업 값을 싣기 시작한 것이다.
          started: true,
          assists: 1,
          goals: 0,
          fouls: 0,
          goalkeeper: false,
        }),
      ]),
    });
    const [{ data }] = tx.v1GameResultParticipant.createMany.mock.calls[0] as [
      { data: unknown[] },
    ];
    expect(data).toHaveLength(2);
  });

  it('사후 어시스트가 붙지 않았으면(변화 없음) 새 리비전을 만들지 않는다', async () => {
    const { service, tx } = makeService();
    // 이번엔 골에 어시스트가 없다 -- predecessor 와 완전히 같은 상태.
    tx.v1GameEvent.findMany.mockResolvedValue([
      { id: 'ev-goal-1', type: 'GOAL', participantId: 'p-scorer', assistParticipantId: null, payload: {}, reversesEventId: null },
    ]);
    const context: GameCommandContext = {
      actor: { actorType: 'SYSTEM', systemActor: 'GAME_END_DERIVER' },
      expectedVersion: 3,
      durableCommandId: 'cmd-2',
      payloadHash: 'hash',
    };

    const result = await (
      service as unknown as {
        syncAssistsIntoSubmittedRevision: (
          tx: unknown,
          gameId: string,
          context: GameCommandContext,
        ) => Promise<unknown | null>;
      }
    ).syncAssistsIntoSubmittedRevision(tx, gameId, context);

    expect(result).toBeNull();
    expect(tx.v1GameResultRevision.create).not.toHaveBeenCalled();
  });
});
