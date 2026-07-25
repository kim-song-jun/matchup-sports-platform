import { Test } from '@nestjs/testing';
import { SmsEventLogService } from '../sms-event-log.service';
import { GabiaSmsSender } from './gabia-sms-sender';
import { SMS_SENDER } from './sms-sender';
import { SolapiSmsSender } from './solapi-sms-sender';

describe('SMS_SENDER provider selection', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV };
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  async function resolveSmsSender() {
    const moduleRef = await Test.createTestingModule({
      providers: [
        // 두 어댑터 모두 실패 기록기를 주입받으므로 DI 그래프에 함께 넣어야 compile 된다.
        { provide: SmsEventLogService, useValue: { record: jest.fn().mockResolvedValue(undefined) } },
        SolapiSmsSender,
        GabiaSmsSender,
        {
          provide: SMS_SENDER,
          useFactory: (solapi: SolapiSmsSender, gabia: GabiaSmsSender) =>
            (process.env.SMS_PROVIDER ?? 'solapi').trim().toLowerCase() === 'gabia'
              ? gabia
              : solapi,
          inject: [SolapiSmsSender, GabiaSmsSender],
        },
      ],
    }).compile();

    return moduleRef.get(SMS_SENDER);
  }

  it('SMS_PROVIDER 미설정 시 SolapiSmsSender를 선택한다', async () => {
    delete process.env.SMS_PROVIDER;
    const sender = await resolveSmsSender();
    expect(sender).toBeInstanceOf(SolapiSmsSender);
  });

  it("SMS_PROVIDER='solapi' 시 SolapiSmsSender를 선택한다", async () => {
    process.env.SMS_PROVIDER = 'solapi';
    const sender = await resolveSmsSender();
    expect(sender).toBeInstanceOf(SolapiSmsSender);
  });

  it("SMS_PROVIDER='gabia' 시 GabiaSmsSender를 선택한다", async () => {
    process.env.SMS_PROVIDER = 'gabia';
    const sender = await resolveSmsSender();
    expect(sender).toBeInstanceOf(GabiaSmsSender);
  });

  it('알 수 없는 값이면 solapi로 폴백한다', async () => {
    process.env.SMS_PROVIDER = 'unknown-provider';
    const sender = await resolveSmsSender();
    expect(sender).toBeInstanceOf(SolapiSmsSender);
  });
});
