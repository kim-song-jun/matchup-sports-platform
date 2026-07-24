import { BadRequestException, Injectable } from '@nestjs/common';
import { randomInt } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword, verifyPassword } from '../auth/password-hash';
import { issuePhoneProofToken } from './phone-proof-token';
import { VerificationDispatcherService } from './verification-dispatcher.service';

const CODE_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

/**
 * 회원가입 전(pre-account) 공개 휴대폰 인증 — MT SMS OTP.
 * userId 가 없으므로 phone 기준 V1PhoneVerificationChallenge(codeHash) 로 코드를 발급/대조한다.
 * 성공 시 issueProof() 로 proofToken 을 발급해 register 에서 재검증한다.
 */
@Injectable()
export class PhoneVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatcher: VerificationDispatcherService,
  ) {}

  /**
   * 휴대폰 인증이 운영 가능한지 — SMS provider 가 설정됐거나 dev-echo 일 때 true.
   * register/social 가입 흐름이 휴대폰 인증 강제 여부를 이 값으로 게이팅한다(provider 미설정 시 게이트 skip).
   */
  get enabled(): boolean {
    return this.dispatcher.smsEnabled || this.dispatcher.devEcho;
  }

  async issueChallenge(phone: string): Promise<{ expiresAt: string; devCode?: string }> {
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const codeHash = await hashPassword(code);
    const expiresAt = new Date(Date.now() + CODE_TTL_MS);

    await this.prisma.v1PhoneVerificationChallenge.upsert({
      where: { phone },
      update: { codeHash, expiresAt, attemptCount: 0, verifiedAt: null },
      create: { phone, codeHash, expiresAt },
    });

    await this.dispatcher.send('phone', phone, code);

    return { expiresAt: expiresAt.toISOString(), ...(this.dispatcher.devEcho ? { devCode: code } : {}) };
  }

  async verifyCode(phone: string, code: string): Promise<boolean> {
    const challenge = await this.prisma.v1PhoneVerificationChallenge.findUnique({ where: { phone } });
    if (!challenge || challenge.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException({
        code: 'VERIFICATION_NO_PENDING',
        message: '유효한 인증 요청이 없어요. 인증번호를 다시 받아 주세요.',
      });
    }
    if (challenge.verifiedAt) return true;
    if (challenge.attemptCount >= MAX_ATTEMPTS) {
      throw new BadRequestException({
        code: 'VERIFICATION_TOO_MANY_ATTEMPTS',
        message: '시도 횟수를 초과했어요. 인증번호를 다시 받아 주세요.',
      });
    }

    await this.prisma.v1PhoneVerificationChallenge.update({
      where: { phone },
      data: { attemptCount: { increment: 1 } },
    });

    const matches = await verifyPassword(code, challenge.codeHash);
    if (!matches) {
      throw new BadRequestException({
        code: 'VERIFICATION_CODE_MISMATCH',
        message: '인증번호가 올바르지 않아요.',
      });
    }

    await this.prisma.v1PhoneVerificationChallenge.update({
      where: { phone },
      data: { verifiedAt: new Date() },
    });
    return true;
  }

  issueProof(phone: string): string {
    return issuePhoneProofToken(phone);
  }
}
