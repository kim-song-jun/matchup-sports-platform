import { PrismaService } from '../prisma/prisma.service';
import { SMS_EVENT_TYPE, SmsEventLogService, maskPhoneTail, redactPhoneLike } from './sms-event-log.service';

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

  it('전화번호 형태가 아닌 대상(이메일 등)은 항상 ****로 떨어진다', () => {
    expect(maskPhoneTail('user@example.com')).toBe('****');
    expect(maskPhoneTail('')).toBe('****');
    // 로컬파트에 숫자가 있어도 그 조각이 새면 안 된다(이메일 채널 인증 실패도 기록되는 경로).
    expect(maskPhoneTail('user2026@example.com')).toBe('****');
    expect(maskPhoneTail('20260725@corp.co.kr')).toBe('****');
  });

  it('전화번호는 구분자가 있어도 끝 4자리를 남긴다', () => {
    expect(maskPhoneTail('821012345678')).toBe('5678');
    expect(maskPhoneTail('010-1234-5678')).toBe('5678');
    expect(maskPhoneTail('+82 10 1234 5678')).toBe('5678');
    expect(maskPhoneTail('123')).toBe('****');
  });

  // provider 응답 본문은 수신자 번호를 그대로 에코하는 경우가 있다. detail 로 원본 번호가
  // 새면 phoneMasked 로 지킨 "끝 4자리만" 보장이 우회되므로 여기서 막는다.
  it('detail 에 섞인 전화번호를 끝 4자리만 남기고 가린다', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'log-1' });
    const svc = new SmsEventLogService(prismaMock(create));

    await svc.record({
      eventType: SMS_EVENT_TYPE.SEND_FAILED,
      phone: '01012345678',
      detail: 'invalid receiver 01012345678 / alt 010-9876-5432',
    });

    const { detail } = create.mock.calls[0][0].data;
    expect(detail).not.toContain('01012345678');
    expect(detail).not.toContain('010-9876-5432');
    expect(detail).toContain('***5678');
    expect(detail).toContain('***5432');
  });

  it('구분자 표기가 달라도 가린다 (괄호·점·국가코드)', () => {
    // 매치는 첫 숫자부터라 여는 괄호는 그대로 남는다 — 번호 자체가 가려지면 목적은 달성.
    expect(redactPhoneLike('to=(010)1234-5678')).toBe('to=(***5678');
    expect(redactPhoneLike('to=010.1234.5678')).toBe('to=***5678');
    expect(redactPhoneLike('to=+82-10-1234-5678')).toBe('to=+***5678');
    expect(redactPhoneLike('to=821012345678')).toBe('to=***5678');
  });

  it('전화번호가 아닌 진단용 숫자는 그대로 남긴다 (detail 의 쓸모 유지)', () => {
    expect(redactPhoneLike('timed out after 8000ms')).toBe('timed out after 8000ms');
    expect(redactPhoneLike('Bad Request: 400')).toBe('Bad Request: 400');
    expect(redactPhoneLike('occurred 2026-07-25')).toBe('occurred 2026-07-25');
    expect(redactPhoneLike('인증 시도 2/5')).toBe('인증 시도 2/5');
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
