import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import type { V1AuthUser } from '../../auth/v1-auth-user';
import { AdminQuickResultController } from './admin-quick-result.controller';
import type { QuickResultDto } from './quick-result.dto';

const user: V1AuthUser = {
  id: '7c1f0000-0000-4000-8000-000000000001',
  email: 'ops@example.test',
  accountStatus: 'active',
  onboardingStatus: 'completed',
};
const dto: QuickResultDto = {
  clientCommandId: '7c1f0000-0000-4000-8000-0000000000aa',
  expectedVersion: 2,
  score: { home: 3, away: 1 },
};

describe('AdminQuickResultController', () => {
  it('라우트 계약 — POST admin/games/:gameId/quick-result', () => {
    expect(Reflect.getMetadata('path', AdminQuickResultController)).toBe('admin/games');
    expect(Reflect.getMetadata('path', AdminQuickResultController.prototype.quickResult)).toBe(':gameId/quick-result');
    // RequestMethod.POST === 1
    expect(Reflect.getMetadata('method', AdminQuickResultController.prototype.quickResult)).toBe(1);
  });

  it('어드민 mutation 게이트가 거부하면(support 등) 서비스를 부르지 않는다', async () => {
    const quickResult = jest.fn();
    const getMutationAdmin = jest.fn().mockRejectedValue(
      new ForbiddenException({ code: 'PERMISSION_DENIED', message: 'Support admins cannot mutate' }),
    );
    const controller = new AdminQuickResultController({ getMutationAdmin } as never, { quickResult } as never);

    await expect(controller.quickResult(user, 'game-1', 'key-1', dto)).rejects.toBeInstanceOf(ForbiddenException);

    expect(getMutationAdmin).toHaveBeenCalledWith(user.id);
    expect(quickResult).not.toHaveBeenCalled();
  });

  it('게이트를 지나면 헤더 키와 본문을 그대로 서비스에 넘기고 응답을 돌려준다', async () => {
    const response = { gameId: 'game-1', revisionId: 'rev-1', version: 3, score: { home: 3, away: 1 } };
    const quickResult = jest.fn().mockResolvedValue(response);
    const controller = new AdminQuickResultController(
      { getMutationAdmin: jest.fn().mockResolvedValue({ adminRole: 'ops' }) } as never,
      { quickResult } as never,
    );

    await expect(controller.quickResult(user, 'game-1', 'key-1', dto)).resolves.toBe(response);

    expect(quickResult).toHaveBeenCalledWith(user, 'game-1', dto, 'key-1');
  });
});
