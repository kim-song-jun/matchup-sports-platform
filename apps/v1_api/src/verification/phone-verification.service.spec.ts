import { BadRequestException } from '@nestjs/common';
import { OctomoApiError, OctomoClient } from './octomo.client';
import { PhoneVerificationService } from './phone-verification.service';

function prismaMock() {
  const store = new Map<string, { phone: string; code: string; channel: string; expiresAt: Date; attemptCount: number; verifiedAt: Date | null }>();
  return {
    v1PhoneVerificationChallenge: {
      upsert: jest.fn(async ({ where, create }: { where: { phone: string }; create: { phone: string; code: string; channel: string; expiresAt: Date } }) => {
        const row = { phone: create.phone, code: create.code, channel: create.channel, expiresAt: create.expiresAt, attemptCount: 0, verifiedAt: null };
        store.set(where.phone, row);
        return row;
      }),
      findUnique: jest.fn(async ({ where }: { where: { phone: string } }) => store.get(where.phone) ?? null),
      update: jest.fn(async ({ where, data }: { where: { phone: string }; data: Record<string, unknown> }) => {
        const row = store.get(where.phone)!;
        if ((data.attemptCount as { increment?: number })?.increment) row.attemptCount += 1;
        if ('verifiedAt' in data) row.verifiedAt = data.verifiedAt as Date;
        return row;
      }),
    },
    __store: store,
  } as never;
}

describe('PhoneVerificationService', () => {
  const OLD = { key: process.env.OCTOMO_API_KEY, echo: process.env.V1_VERIFICATION_DEV_ECHO };
  afterEach(() => { process.env.OCTOMO_API_KEY = OLD.key; process.env.V1_VERIFICATION_DEV_ECHO = OLD.echo; jest.restoreAllMocks(); });

  it('issues an 8-char challenge and (desktop) fetches a QR from octomo', async () => {
    process.env.OCTOMO_API_KEY = 'k';
    const octomo = new OctomoClient();
    jest.spyOn(octomo, 'createQrCode').mockResolvedValue('data:image/png;base64,QR');
    const prisma = prismaMock();
    const svc = new PhoneVerificationService(prisma, octomo);
    const res = await svc.issueChallenge('01012345678', 'desktop');
    expect(res.code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
    expect(res.destNumber).toBe('16663538');
    expect(res.qrCode).toBe('data:image/png;base64,QR');
    expect(octomo.createQrCode).toHaveBeenCalledWith(res.code);
  });

  it('mobile issue does not fetch a QR', async () => {
    process.env.OCTOMO_API_KEY = 'k';
    const octomo = new OctomoClient();
    const qr = jest.spyOn(octomo, 'createQrCode');
    const svc = new PhoneVerificationService(prismaMock(), octomo);
    const res = await svc.issueChallenge('01012345678', 'mobile');
    expect(res.qrCode).toBeUndefined();
    expect(qr).not.toHaveBeenCalled();
  });

  it('pollArrived calls octomo messageExists with the stored code and marks verifiedAt', async () => {
    process.env.OCTOMO_API_KEY = 'k';
    const octomo = new OctomoClient();
    const prisma = prismaMock();
    const svc = new PhoneVerificationService(prisma, octomo);
    const { code } = await svc.issueChallenge('01012345678', 'mobile');
    const spy = jest.spyOn(octomo, 'messageExists').mockResolvedValue(true);
    expect(await svc.pollArrived('01012345678')).toBe(true);
    expect(spy).toHaveBeenCalledWith('01012345678', code, 5);
    expect((prisma as never as { __store: Map<string, { verifiedAt: Date | null }> }).__store.get('01012345678')!.verifiedAt).toBeInstanceOf(Date);
  });

  it('pollArrived returns false with no challenge', async () => {
    process.env.OCTOMO_API_KEY = 'k';
    const svc = new PhoneVerificationService(prismaMock(), new OctomoClient());
    expect(await svc.pollArrived('01000000000')).toBe(false);
  });

  it('throws when poll attempts exceed the cap (180, covers 2s polling over the 5min TTL)', async () => {
    process.env.OCTOMO_API_KEY = 'k';
    const octomo = new OctomoClient();
    jest.spyOn(octomo, 'messageExists').mockResolvedValue(false);
    const prisma = prismaMock();
    const svc = new PhoneVerificationService(prisma, octomo);
    await svc.issueChallenge('01012345678', 'mobile');
    // 30회로는 더 이상 막히지 않는다(desktop 자동폴링이 문자 전송 전에 자멸하던 회귀 방지).
    (prisma as never as { __store: Map<string, { attemptCount: number }> }).__store.get('01012345678')!.attemptCount = 30;
    await expect(svc.pollArrived('01012345678')).resolves.toBe(false);
    (prisma as never as { __store: Map<string, { attemptCount: number }> }).__store.get('01012345678')!.attemptCount = 180;
    await expect(svc.pollArrived('01012345678')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('swallows octomo errors during poll as not-arrived (no 500, keeps polling alive)', async () => {
    process.env.OCTOMO_API_KEY = 'k';
    const octomo = new OctomoClient();
    // timeout(504)·rate-limit(429)·5xx 등 옥토모 일시 오류가 verify를 500으로 터뜨리면
    // 매 폴링이 실패하고 커넥션이 쌓여 upstream이 죽는다 → 조용히 false로 흡수해야 한다.
    jest.spyOn(octomo, 'messageExists').mockRejectedValue(new OctomoApiError(504, 'Octomo request timed out'));
    const prisma = prismaMock();
    const svc = new PhoneVerificationService(prisma, octomo);
    await svc.issueChallenge('01012345678', 'mobile');
    await expect(svc.pollArrived('01012345678')).resolves.toBe(false);
    // 도착으로 오판하지 않았는지(verifiedAt 미세팅) 확인
    expect((prisma as never as { __store: Map<string, { verifiedAt: Date | null }> }).__store.get('01012345678')!.verifiedAt).toBeNull();
  });

  it('dev echo auto-passes when octomo disabled', async () => {
    delete process.env.OCTOMO_API_KEY;
    process.env.V1_VERIFICATION_DEV_ECHO = 'true';
    const svc = new PhoneVerificationService(prismaMock(), new OctomoClient());
    expect(svc.enabled).toBe(true);
    await svc.issueChallenge('01012345678', 'mobile');
    expect(await svc.pollArrived('01012345678')).toBe(true);
  });
});
