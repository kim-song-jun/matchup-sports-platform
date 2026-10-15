import { createGlobalValidationPipe } from '../../../common/global-validation-pipe';
import { GameRosterBatchDto } from './team-game-roster.dto';

const transform = (goalkeeper: unknown) => createGlobalValidationPipe().transform({
  changes: [{ gameId: 'game', userId: 'player', op: 'SET_GOALKEEPER', goalkeeper }],
}, { type: 'body', metatype: GameRosterBatchDto });

describe('일괄 GK 지정 — 실제 전역 ValidationPipe', () => {
  it.each([true, false])('JSON Boolean %s의 값을 그대로 유지한다', async (goalkeeper) => {
    const input = await transform(goalkeeper);
    expect(input.changes[0].goalkeeper).toBe(goalkeeper);
  });
  it.each(['true', 'false', 1, 0, null, undefined])('Boolean 아닌 %s는 자동 변환하지 않고 거절한다', async (goalkeeper) => {
    await expect(transform(goalkeeper)).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } });
  });
});
