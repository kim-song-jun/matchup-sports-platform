import { PrismaService } from '../prisma/prisma.service';
import { SMS_EVENT_TYPE, SmsEventLogService, maskPhoneTail } from './sms-event-log.service';

function prismaMock(create = jest.fn().mockResolvedValue({ id: 'log-1' })) {
  return { v1SmsEventLog: { create } } as unknown as PrismaService;
}

describe('SmsEventLogService', () => {
  it('전화번호는 끝 4자리만 저장하고 원본은 어디에도 넣지 않는다', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'log-1' });
    const svc = new SmsEventLogService(prismaMock(create));

    await svc.record({
      eventType: SMS_EVENT_TYPE.CODE_MISMATCH,
      phone: '010-1234-5678',
      detail: 'channel=phone 인증 시도 1/5',
    });

    const { data } = create.mock.calls[0][0];
    expect(data.phoneMasked).toBe('5678');
    expect(JSON.stringify(data)).not.toContain('01012345678');
    expect(JSON.stringify(data)).not.toContain('010-1234-5678');
  });

  it('숫자가 4자 미만인 대상(이메일 등)은 ****로 떨어진다', () => {
    expect(maskPhoneTail('user@example.com')).toBe('****');
    expect(maskPhoneTail('')).toBe('****');
    expect(maskPhoneTail('821012345678')).toBe('5678');
  });

  it('detail 은 상한(500자)으로 잘라 저장한다', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'log-1' });
    const svc = new SmsEventLogService(prismaMock(create));

    await svc.record({
      eventType: SMS_EVENT_TYPE.SEND_FAILED,
      phone: '01012345678',
      detail: 'x'.repeat(2000),
    });

    expect(create.mock.calls[0][0].data.detail).toHaveLength(500);
  });

  // ── 핵심 계약 ────────────────────────────────────────────────────────────
  // 이 테스트가 깨지면 "관측용 로깅 실패가 인증 자체를 죽이는" 회귀가 들어온 것이다.
  it('DB insert 가 실패해도 throw 하지 않는다 (인증 본흐름 보호)', async () => {
    const create = jest.fn().mockRejectedValue(new Error('DB is down'));
    const svc = new SmsEventLogService(prismaMock(create));

    await expect(
      svc.record({ eventType: SMS_EVENT_TYPE.NOT_CONFIGURED, phone: '01012345678' }),
    ).resolves.toBeUndefined();
    expect(create).toHaveBeenCalled();
  });

  it('prisma 델리게이트 자체가 없어도(스키마 드리프트) throw 하지 않는다', async () => {
    const svc = new SmsEventLogService({} as unknown as PrismaService);

    await expect(
      svc.record({ eventType: SMS_EVENT_TYPE.SEND_FAILED, phone: '01012345678' }),
    ).resolves.toBeUndefined();
  });
});
