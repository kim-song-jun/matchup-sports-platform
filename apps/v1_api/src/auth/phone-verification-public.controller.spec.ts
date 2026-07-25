import { PhoneVerificationPublicController } from './phone-verification-public.controller';

describe('PhoneVerificationPublicController (MT SMS OTP)', () => {
  function buildController(overrides: Partial<Record<string, jest.Mock>> = {}) {
    const phoneVerification = {
      issueChallenge: jest.fn(),
      verifyCode: jest.fn(),
      issueProof: jest.fn(),
      ...overrides,
    };
    const controller = new PhoneVerificationPublicController(phoneVerification as never);
    return { controller, phoneVerification };
  }

  describe('issue', () => {
    it('delegates to issueChallenge(phone) and returns its result', async () => {
      const { controller, phoneVerification } = buildController({
        issueChallenge: jest.fn().mockResolvedValue({ expiresAt: '2026-07-25T00:05:00.000Z', devCode: '123456' }),
      });

      const result = await controller.issue({ phone: '01012345678' });

      expect(phoneVerification.issueChallenge).toHaveBeenCalledWith('01012345678');
      expect(result).toEqual({ expiresAt: '2026-07-25T00:05:00.000Z', devCode: '123456' });
    });
  });

  describe('verify', () => {
    it('verifies the code and returns verified:true with a proofToken', async () => {
      const { controller, phoneVerification } = buildController({
        verifyCode: jest.fn().mockResolvedValue(true),
        issueProof: jest.fn().mockReturnValue('proof-token-value'),
      });

      const result = await controller.verify({ phone: '01012345678', code: '123456' });

      expect(phoneVerification.verifyCode).toHaveBeenCalledWith('01012345678', '123456');
      // purpose 를 생략하면 기존 동작 그대로 가입용 토큰이 발급된다(service 기본값 'signup').
      expect(phoneVerification.issueProof).toHaveBeenCalledWith('01012345678', undefined);
      expect(result).toEqual({ verified: true, proofToken: 'proof-token-value' });
    });

    // 계정 찾기·비밀번호 재설정은 가입용 토큰과 섞이면 안 되므로 용도를 그대로 전달해야 한다.
    it('요청한 용도를 그대로 넘겨 증명 토큰을 발급한다', async () => {
      const { controller, phoneVerification } = buildController({
        verifyCode: jest.fn().mockResolvedValue(true),
        issueProof: jest.fn().mockReturnValue('reset-token-value'),
      });

      await controller.verify({ phone: '01012345678', code: '123456', purpose: 'password_reset' });

      expect(phoneVerification.issueProof).toHaveBeenCalledWith('01012345678', 'password_reset');
    });

    it('propagates a mismatch error from verifyCode without issuing a proofToken', async () => {
      const { controller, phoneVerification } = buildController({
        verifyCode: jest.fn().mockRejectedValue(new Error('VERIFICATION_CODE_MISMATCH')),
      });

      await expect(controller.verify({ phone: '01012345678', code: '000000' })).rejects.toThrow();
      expect(phoneVerification.issueProof).not.toHaveBeenCalled();
    });
  });
});
