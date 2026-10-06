import type { Prisma } from '@prisma/client';
import { nextFixtureCreationCommandId } from './tournament-fixture-generation';

const BASE = 'tournament-fixture:tour-1:quarter:1:1';
function setup(records: { idempotencyKey: string; resourceId: string }[]) {
  return { v1IdempotencyRecord: { findMany: jest.fn().mockResolvedValue(records) }, v1TournamentMatchDetails: {
    findMany: jest.fn().mockResolvedValue(records.map((record) => ({ teamMatchId: record.resourceId, tournamentId: 'tour-1' }))),
  } };
}
describe('번호 이동 후 빈 좌표 생성 세대', () => {
  it('첫 생성은 기존 키를 유지한다', async () => {
    const tx = setup([]);
    expect(await nextFixtureCreationCommandId(tx as unknown as Prisma.TransactionClient, BASE, 'tour-1', 0, 'operator')).toBe(BASE);
  });
  it('이전 경기 번호가 이동했으면 새 세대를 선택하고 기존 기록을 덮어쓰지 않는다', async () => {
    const tx = setup([{ idempotencyKey: BASE, resourceId: 'moved-match' }]);
    expect(await nextFixtureCreationCommandId(tx as unknown as Prisma.TransactionClient, BASE, 'tour-1', 0, 'operator')).toBe(BASE + ':revision:1');
    expect(tx.v1IdempotencyRecord.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ actorUserId: 'operator', action: 'source_create', resourceType: 'TEAM_MATCH' }) }));
    expect(tx.v1TournamentMatchDetails.findMany).toHaveBeenCalledWith({ where: { teamMatchId: { in: ['moved-match'] } }, select: { teamMatchId: true, tournamentId: true } });
  });
  it('여러 번 이동·삭제되면 최고 세대 다음을 사용한다', async () => {
    const tx = setup([{ idempotencyKey: BASE, resourceId: 'a' }, { idempotencyKey: BASE + ':revision:4', resourceId: 'b' }]);
    expect(await nextFixtureCreationCommandId(tx as unknown as Prisma.TransactionClient, BASE, 'tour-1', 1, 'operator')).toBe(BASE + ':revision:5');
  });
  it('정본이 사라진 멱등 기록은 성공으로 숨기지 않는다', async () => {
    const tx = setup([{ idempotencyKey: BASE, resourceId: 'missing' }]);
    tx.v1TournamentMatchDetails.findMany.mockResolvedValue([]);
    await expect(nextFixtureCreationCommandId(tx as unknown as Prisma.TransactionClient, BASE, 'tour-1', 0, 'operator')).rejects.toMatchObject({ response: { code: 'TEAM_MATCH_IDEMPOTENCY_INCOMPLETE' } });
  });
});
