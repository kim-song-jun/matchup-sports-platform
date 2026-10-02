import { V1GameOperationsWorkerService } from '../../src/jobs/v1-game-operations-worker.service';
import type { PrismaService } from '../../src/prisma/prisma.service';

/**
 * 지금 처리할 수 있는 아웃박스 이벤트를 워커로 모두 처리한다. 경기 명단 재계산처럼 쓰기 트랜잭션이
 * 후속 이벤트만 남기는 계약을 검증할 때, "워커가 처리한 뒤" 상태를 보려고 부른다.
 */
export async function drainOutboxWorker(prisma: PrismaService): Promise<void> {
  const worker = new V1GameOperationsWorkerService(prisma);
  for (let processed = 0; await worker.processOne(); processed += 1) {
    // 조용히 멈추면 뒤의 단언이 엉뚱한 이유로 실패한다 — 밀린 이벤트가 이만큼이면 그 자체가 문제다.
    if (processed >= 100) throw new Error('Outbox drain guard exceeded');
  }
}
