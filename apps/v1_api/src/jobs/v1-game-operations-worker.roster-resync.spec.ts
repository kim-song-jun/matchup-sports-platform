import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { COMPETITION_ROSTER_RESYNC_TYPE } from '../games/roster/roster-resync-events';
import {
  V1GameOperationsWorkerService,
  withCompetitionRosterResync,
  type GameOperationClaim,
} from './v1-game-operations-worker.service';

function claim(overrides: Partial<GameOperationClaim> = {}): GameOperationClaim {
  return {
    id: 'outbox-1',
    businessKey: 'game:game-1:revision:2:official',
    aggregateType: 'GAME',
    aggregateId: 'game-1',
    revisionId: 'revision-2',
    type: 'GAME_RESULT_OFFICIAL',
    payload: {},
    attempts: 1,
    retryGeneration: 0,
    version: 1,
    leaseOwner: 'worker-1',
    leaseUntil: new Date('2099-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('결과 이벤트 뒤 명단 재계산 — 결과 트랜잭션 밖의 후속 이벤트', () => {
  // 결과 핸들러(순위 투영 등)는 이미 경기·팀 매치를 쥐고 있다. 그 트랜잭션에서 양 팀의 다른 경기를
  // 잡으면 경기 잠금 순서가 깨져 대진 수정과 교착하므로, 재계산은 자기 트랜잭션의 첫 잠금이 되게 넘긴다.
  it('결과 핸들러 트랜잭션에서는 경기를 잠그지 않고 후속 이벤트만 남긴다', async () => {
    const order: string[] = [];
    const tx = {
      $executeRaw: jest.fn(async (strings: TemplateStringsArray) => {
        order.push(`execute:${strings.join('?').includes('INSERT INTO v1_outbox_events') ? 'outbox' : 'other'}`);
        return 1;
      }),
      $queryRaw: jest.fn(async () => {
        order.push('query');
        return [];
      }),
    };
    const handler = jest.fn(async () => {
      order.push('handler');
    });

    await withCompetitionRosterResync(handler)(claim(), tx as unknown as Prisma.TransactionClient);

    expect(order).toEqual(['handler', 'execute:outbox']);
    const [, ...values] = tx.$executeRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    expect(values).toEqual(
      expect.arrayContaining(['game:game-1:revision:2:official:roster-resync', 'game-1', COMPETITION_ROSTER_RESYNC_TYPE]),
    );
    expect(JSON.parse(String(values[5]))).toEqual({ scope: 'result', gameId: 'game-1' });
  });

  it('경기가 아닌 집계의 이벤트에는 후속 이벤트를 남기지 않는다', async () => {
    const tx = { $executeRaw: jest.fn(async () => 1) };
    await withCompetitionRosterResync(jest.fn(async () => undefined))(
      claim({ aggregateType: 'TOURNAMENT' }),
      tx as unknown as Prisma.TransactionClient,
    );
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('워커가 후속 이벤트 핸들러를 등록한다 — 없으면 재시도 끝에 POISONED 로 간다', () => {
    const worker = new V1GameOperationsWorkerService({} as PrismaService);
    expect(worker.hasHandler(COMPETITION_ROSTER_RESYNC_TYPE)).toBe(true);
  });
});
