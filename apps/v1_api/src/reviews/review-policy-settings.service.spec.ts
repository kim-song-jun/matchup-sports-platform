import { ReviewPolicySettingsService } from './review-policy-settings.service';
import { DEFAULT_REVIEW_WINDOW_HOURS } from './review-deadline';

function build(row: { reviewWindowHours: number; updatedAt?: Date } | null) {
  const upsert = jest.fn().mockResolvedValue({});
  const logAdminAction = jest.fn().mockResolvedValue({ actionLogId: 'log-1', statusChangeLogId: null });
  const findUnique = jest.fn().mockResolvedValue(row);
  const prisma = {
    v1ReviewPolicySettings: { findUnique, upsert },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ v1ReviewPolicySettings: { upsert } }),
  };
  const service = new ReviewPolicySettingsService(prisma as never, { logAdminAction } as never);
  return { service, findUnique, upsert, logAdminAction };
}

describe('ReviewPolicySettingsService', () => {
  it('설정 행이 없으면 기본값 168시간을 쓴다', async () => {
    const { service } = build(null);
    await expect(service.getWindowHours()).resolves.toBe(DEFAULT_REVIEW_WINDOW_HOURS);
  });

  it('저장된 값이 있으면 그 값을 쓴다', async () => {
    const { service } = build({ reviewWindowHours: 72 });
    await expect(service.getWindowHours()).resolves.toBe(72);
  });

  it.each([0, -5, 24 * 365 + 1])(
    '범위를 벗어난 값(%s)은 기본값으로 되돌린다 — 잘못된 설정이 리뷰를 영구히 막지 않게',
    async (hours) => {
      const { service } = build({ reviewWindowHours: hours });
      await expect(service.getWindowHours()).resolves.toBe(DEFAULT_REVIEW_WINDOW_HOURS);
    },
  );

  it('get()은 화면 표기용 레이블과 경계값을 함께 준다', async () => {
    const { service } = build({ reviewWindowHours: 168, updatedAt: new Date('2026-08-18T00:00:00.000Z') });
    await expect(service.get()).resolves.toMatchObject({
      reviewWindowHours: 168,
      reviewWindowLabel: '7일',
      minHours: 1,
      maxHours: 8760,
      defaultHours: 168,
      isDefault: false,
      updatedAt: '2026-08-18T00:00:00.000Z',
    });
  });

  it('update()는 싱글턴 행을 upsert하고 변경 전후 값을 감사 로그에 남긴다', async () => {
    const { service, upsert, logAdminAction } = build({ reviewWindowHours: 48 });
    const admin = { id: 'admin-1' } as never;

    await service.update(admin, { reviewWindowHours: 168 });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'singleton' },
        create: expect.objectContaining({ reviewWindowHours: 168, updatedByAdminUserId: 'admin-1' }),
        update: expect.objectContaining({ reviewWindowHours: 168, updatedByAdminUserId: 'admin-1' }),
      }),
    );
    expect(logAdminAction).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({
        action: 'review_policy_settings.update',
        targetType: 'review_policy_settings',
        targetId: 'singleton',
        beforeJson: { reviewWindowHours: 48 },
        afterJson: { reviewWindowHours: 168 },
      }),
      expect.anything(),
    );
  });
});
