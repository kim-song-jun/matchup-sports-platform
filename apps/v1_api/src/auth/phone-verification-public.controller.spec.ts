import { PhoneVerificationPublicController } from './phone-verification-public.controller';

describe('PhoneVerificationPublicController', () => {
  function buildController(overrides: Partial<Record<string, jest.Mock>> = {}) {
    const phoneVerification = {
      issueChallenge: jest.fn(),
      pollArrived: jest.fn(),
      issueProof: jest.fn(),
      ...overrides,
    };
    const controller = new PhoneVerificationPublicController(phoneVerification as never);
    return { controller, phoneVerification };
  }

  describe('issue', () => {
    it('delegates to phoneVerification.issueChallenge and returns its fields', async () => {
      const { controller, phoneVerification } = buildController({
        issueChallenge: jest.fn().mockResolvedValue({
          code: 'ABC123',
          destNumber: '16663538',
          qrCode: undefined,
          expiresAt: '2026-07-23T00:05:00.000Z',
        }),
      });

      const result = await controller.issue({ phone: '01012345678', channel: 'mobile' });

      expect(phoneVerification.issueChallenge).toHaveBeenCalledWith('01012345678', 'mobile');
      expect(result).toEqual({
        code: 'ABC123',
        destNumber: '16663538',
        qrCode: undefined,
        expiresAt: '2026-07-23T00:05:00.000Z',
      });
    });
  });

  describe('verify', () => {
    it('returns verified:false without a proofToken when the code has not arrived', async () => {
      const { controller, phoneVerification } = buildController({
        pollArrived: jest.fn().mockResolvedValue(false),
      });

      const result = await controller.verify({ phone: '01012345678' });

      expect(result).toEqual({ verified: false });
      expect(phoneVerification.issueProof).not.toHaveBeenCalled();
    });

    it('returns verified:true with a proofToken when the code has arrived', async () => {
      const { controller, phoneVerification } = buildController({
        pollArrived: jest.fn().mockResolvedValue(true),
        issueProof: jest.fn().mockReturnValue('proof-token-value'),
      });

      const result = await controller.verify({ phone: '01012345678' });

      expect(phoneVerification.issueProof).toHaveBeenCalledWith('01012345678');
      expect(result).toEqual({ verified: true, proofToken: 'proof-token-value' });
    });
  });
});
