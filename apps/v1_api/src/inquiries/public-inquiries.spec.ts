import { ConflictException, RequestMethod } from '@nestjs/common';
import { THROTTLER_LIMIT, THROTTLER_TTL } from '@nestjs/throttler/dist/throttler.constants';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import type { CreatePublicInquiryDto } from './dto/public-inquiry.dto';
import { InquiriesService, PUBLIC_INQUIRY_MIN_FILL_MS } from './inquiries.service';
import { PublicInquiriesController } from './public-inquiries.controller';
import { InquiriesModule } from './inquiries.module';
import { OmitErrorLogBodyMiddleware } from '../common/logging/omit-error-log-body';

const now = new Date('2026-09-27T03:00:00.000Z');

const dto = (overrides: Partial<CreatePublicInquiryDto> = {}): CreatePublicInquiryDto => ({
  category: 'tournament_hosting',
  organization: '가상 풋살 연합',
  name: '담당자',
  email: 'Host@Example.test ',
  message: '가을 풋살 대회를 열고 싶어요.',
  sportType: 'futsal',
  expectedSchedule: '10월 주말',
  consent: true,
  website: '',
  formStartedAt: now.getTime() - 60_000,
  ...overrides,
});

describe('InquiriesService.createPublic', () => {
  const prisma: any = {
    $transaction: jest.fn((callback: (tx: any) => unknown) => callback(prisma)),
    v1Inquiry: { findMany: jest.fn(), create: jest.fn() },
    v1OutboxEvent: { create: jest.fn() },
    v1SiteInfoSettings: { findUnique: jest.fn() },
  };
  let service: InquiriesService;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(now);
    prisma.v1Inquiry.findMany.mockResolvedValue([]);
    prisma.v1SiteInfoSettings.findUnique.mockResolvedValue(null);
    prisma.v1Inquiry.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ ...data, id: 'inquiry-g1', createdAt: now }),
    );
    service = new InquiriesService(prisma);
    warn = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => jest.useRealTimers());

  it('stores a guest row with a structured body and queues the Slack outbox event', async () => {
    await expect(service.createPublic(dto(), '203.0.113.9')).resolves.toEqual({ received: true });

    const data = prisma.v1Inquiry.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      userId: null,
      guestEmail: 'host@example.test',
      guestPhone: null,
      category: 'tournament_hosting',
      title: '대회 개설 문의 · 가상 풋살 연합',
    });
    expect(data.body).toBe(
      [
        '단체명: 가상 풋살 연합',
        '담당자: 담당자',
        '종목: 풋살',
        '희망 시기: 10월 주말',
        '개인정보 수집·이용 동의: 동의함 (보관 기간: 문의 처리 완료 후 1년)',
        '--- 문의 내용 ---',
        '가을 풋살 대회를 열고 싶어요.',
      ].join('\n'),
    );
    const outbox = prisma.v1OutboxEvent.create.mock.calls[0][0].data;
    expect(outbox).toMatchObject({ type: 'INQUIRY_SLACK_NOTIFICATION', aggregateId: 'inquiry-g1' });
    expect(outbox.payload).not.toHaveProperty('body');
    expect(outbox.payload.title).toBe('대회 개설 문의 (비회원)');
    for (const personal of ['host@example.test', '가상 풋살 연합', '담당자']) {
      expect(JSON.stringify(outbox.payload)).not.toContain(personal);
    }
  });

  it('records the retention text the admin has set at submission time', async () => {
    prisma.v1SiteInfoSettings.findUnique.mockResolvedValue({ guestInquiryRetention: '  문의 처리 완료 후 6개월 ' });
    await service.createPublic(dto(), undefined);
    const body: string = prisma.v1Inquiry.create.mock.calls[0][0].data.body;
    expect(body).toContain('개인정보 수집·이용 동의: 동의함 (보관 기간: 문의 처리 완료 후 6개월)');
  });

  it('never writes the raw client IP to the discard log', async () => {
    await service.createPublic(dto({ website: 'https://spam.example' }), '203.0.113.9');
    const logged = JSON.stringify(warn.mock.calls[0][0]);
    expect(logged).not.toContain('203.0.113.9');
    expect(warn.mock.calls[0][0].clientIpHash).toMatch(/^[0-9a-f]{12}$/);
  });

  it('silently discards a filled honeypot without touching the database', async () => {
    await expect(service.createPublic(dto({ website: 'https://spam.example' }), '203.0.113.9'))
      .resolves.toEqual({ received: true });
    expect(prisma.v1Inquiry.findMany).not.toHaveBeenCalled();
    expect(prisma.v1Inquiry.create).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ reason: 'honeypot' }), expect.any(String));
  });

  it('silently discards a submission faster than the minimum fill time', async () => {
    const formStartedAt = now.getTime() - (PUBLIC_INQUIRY_MIN_FILL_MS - 1);
    await expect(service.createPublic(dto({ formStartedAt }), '203.0.113.9')).resolves.toEqual({ received: true });
    expect(prisma.v1Inquiry.create).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ reason: 'too_fast' }), expect.any(String));
  });

  it('accepts a submission exactly at the minimum fill time', async () => {
    const formStartedAt = now.getTime() - PUBLIC_INQUIRY_MIN_FILL_MS;
    await service.createPublic(dto({ formStartedAt }), undefined);
    expect(prisma.v1Inquiry.create).toHaveBeenCalledTimes(1);
  });

  it('blocks the same email and message within 24 hours with 409 INQUIRY_DUPLICATE', async () => {
    await service.createPublic(dto(), undefined);
    const storedBody = prisma.v1Inquiry.create.mock.calls[0][0].data.body;
    prisma.v1Inquiry.findMany.mockResolvedValue([{ body: storedBody }]);

    const error = await service.createPublic(dto({ organization: '다른 이름' }), undefined).catch((e) => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).toMatchObject({ code: 'INQUIRY_DUPLICATE' });
    expect(prisma.v1Inquiry.create).toHaveBeenCalledTimes(1);

    const where = prisma.v1Inquiry.findMany.mock.calls[1][0].where;
    expect(where).toMatchObject({ userId: null, guestEmail: 'host@example.test' });
    expect(where.createdAt.gte).toEqual(new Date(now.getTime() - 24 * 60 * 60 * 1000));
    expect(prisma.v1Inquiry.findMany.mock.calls[1][0].orderBy).toEqual({ createdAt: 'desc' });
  });

  it('accepts a different message from the same email', async () => {
    prisma.v1Inquiry.findMany.mockResolvedValue([
      { body: '담당자: 담당자\n--- 문의 내용 ---\n지난번 문의예요.' },
    ]);
    await expect(service.createPublic(dto(), undefined)).resolves.toEqual({ received: true });
    expect(prisma.v1Inquiry.create).toHaveBeenCalledTimes(1);
  });

  it('keeps a newline in a header field from forging the message separator', async () => {
    await service.createPublic(dto({ organization: '가상\n--- 문의 내용 ---\n가짜' }), undefined);
    const body: string = prisma.v1Inquiry.create.mock.calls[0][0].data.body;
    expect(body.split('\n--- 문의 내용 ---\n')).toHaveLength(2);
  });
});

describe('PublicInquiriesController', () => {
  const handler = PublicInquiriesController.prototype.create;

  it('is IP-throttled to 3 requests per 10 minutes', () => {
    expect(Reflect.getMetadata(`${THROTTLER_LIMIT}default`, handler)).toBe(3);
    expect(Reflect.getMetadata(`${THROTTLER_TTL}default`, handler)).toBe(600_000);
  });

  it('has no auth guard (intentionally public)', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toBeUndefined();
    expect(Reflect.getMetadata(GUARDS_METADATA, PublicInquiriesController)).toBeUndefined();
  });
});

describe('InquiriesModule', () => {
  it('keeps the guest form body out of the error log for POST /public/inquiries only', () => {
    const forRoutes = jest.fn();
    const apply = jest.fn(() => ({ forRoutes }));
    new InquiriesModule().configure({ apply } as never);
    expect(apply).toHaveBeenCalledWith(OmitErrorLogBodyMiddleware);
    expect(forRoutes).toHaveBeenCalledWith({ path: 'public/inquiries', method: RequestMethod.POST });
  });
});
