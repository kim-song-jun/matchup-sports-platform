import { BadRequestException } from '@nestjs/common';
import { OctomoClient } from './octomo.client';
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

  it('issues a 6-char challenge and (desktop) fetches a QR from octomo', async () => {
    process.env.OCTOMO_API_KEY = 'k';
    const octomo = new OctomoClient();
    jest.spyOn(octomo, 'createQrCode').mockResolvedValue('data:image/png;base64,QR');
    const prisma = prismaMock();
    const svc = new PhoneVerificationService(prisma, octomo);
    const res = await svc.issueChallenge('01012345678', 'desktop');
    expect(res.code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
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

  it('throws when poll attempts exceed the cap', async () => {
    process.env.OCTOMO_API_KEY = 'k';
    const octomo = new OctomoClient();
    jest.spyOn(octomo, 'messageExists').mockResolvedValue(false);
    const prisma = prismaMock();
    const svc = new PhoneVerificationService(prisma, octomo);
    await svc.issueChallenge('01012345678', 'mobile');
    (prisma as never as { __store: Map<string, { attemptCount: number }> }).__store.get('01012345678')!.attemptCount = 30;
    await expect(svc.pollArrived('01012345678')).rejects.toBeInstanceOf(BadRequestException);
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
