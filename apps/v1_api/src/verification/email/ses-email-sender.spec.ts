import { SESv2Client } from '@aws-sdk/client-sesv2';
import { SesEmailSender } from './ses-email-sender';

jest.mock('@aws-sdk/client-sesv2', () => ({
  SESv2Client: jest.fn().mockImplementation(() => ({ send: jest.fn().mockResolvedValue({}) })),
  SendEmailCommand: jest.fn().mockImplementation((input) => input),
}));

const environment = { ...process.env };

describe('SesEmailSender credentials', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...environment, SES_REGION: 'ap-northeast-2', EMAIL_FROM: 'alpha-no-reply@teameet.co.kr' };
    delete process.env.SES_ACCESS_KEY_ID;
    delete process.env.SES_SECRET_ACCESS_KEY;
  });
  afterAll(() => { process.env = environment; });

  it('Alpha uses only its dedicated SES key', async () => {
    process.env.V1_PUSH_ENVIRONMENT = 'alpha';
    process.env.SES_ACCESS_KEY_ID = 'test-access-key';
    process.env.SES_SECRET_ACCESS_KEY = 'test-secret-key';
    const sender = new SesEmailSender();
    expect(sender.enabled).toBe(true);
    await sender.send('person@example.com', 'subject', 'body');
    expect(SESv2Client).toHaveBeenCalledWith({
      region: 'ap-northeast-2',
      credentials: { accessKeyId: 'test-access-key', secretAccessKey: 'test-secret-key' },
    });
  });

  it.each([['', ''], ['test-access-key', ''], ['', 'test-secret-key']])(
    'Alpha disables delivery rather than falling back to the instance role if the key pair is incomplete',
    (keyId, secretKey) => {
      process.env.V1_PUSH_ENVIRONMENT = 'alpha';
      process.env.SES_ACCESS_KEY_ID = keyId;
      process.env.SES_SECRET_ACCESS_KEY = secretKey;
      expect(new SesEmailSender().enabled).toBe(false);
    },
  );

  it('production retains instance-role authentication when no dedicated key is configured', async () => {
    process.env.V1_PUSH_ENVIRONMENT = 'production';
    const sender = new SesEmailSender();
    expect(sender.enabled).toBe(true);
    await sender.send('person@example.com', 'subject', 'body');
    expect(SESv2Client).toHaveBeenCalledWith({ region: 'ap-northeast-2' });
  });
});
