import { BadRequestException, Injectable } from '@nestjs/common';
import { randomInt } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword, verifyPassword } from '../auth/password-hash';
import { issuePhoneProofToken } from './phone-proof-token';
import { VerificationDispatcherService } from './verification-dispatcher.service';

const CODE_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
// 동일 번호로 유료 SMS 를 반복 발송(SMS 폭탄·과금 남용)하지 못하게 막는 재발송 쿨다운.
const RESEND_COOLDOWN_MS = 30 * 1000;

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
    await this.assertResendCooldown(phone);
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const codeHash = await hashPassword(code);
    const expiresAt = new Date(Date.now() + CODE_TTL_MS);

    await this.prisma.v1PhoneVerificationChallenge.upsert({
      where: { phone },
      update: { codeHash, expiresAt, attemptCount: 0, verifiedAt: null },
      create: { phone, codeHash, expiresAt },
    });

    await this.dispatcher.send('phone', phone, code);

    return { expiresAt: expiresAt.toISOString(), ...(this.dispatcher.devEchoActive ? { devCode: code } : {}) };
  }

  async verifyCode(phone: string, code: string): Promise<boolean> {
    const challenge = await this.prisma.v1PhoneVerificationChallenge.findUnique({ where: { phone } });
    if (!challenge || challenge.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException({
        code: 'VERIFICATION_NO_PENDING',
        message: '유효한 인증 요청이 없어요. 인증번호를 다시 받아 주세요.',
      });
    }
    if (challenge.attemptCount >= MAX_ATTEMPTS) {
      throw new BadRequestException({
        code: 'VERIFICATION_TOO_MANY_ATTEMPTS',
        message: '시도 횟수를 초과했어요. 인증번호를 다시 받아 주세요.',
      });
    }

    // verifiedAt 여부와 무관하게 항상 제출된 코드를 codeHash 와 대조한다.
    // 이미 검증된 challenge 라도 잘못된 코드로는 절대 성공시키지 않는다(인증 우회 방지) —
    // verifiedAt 만으로 단락하면 공격자가 번호만 알아도 임의 코드로 proofToken 을 탈취할 수 있다.
    // 올바른 코드 재제출은 그대로 멱등 성공한다.
    const matches = await verifyPassword(code, challenge.codeHash);
    if (!matches) {
      await this.prisma.v1PhoneVerificationChallenge.update({
        where: { phone },
        data: { attemptCount: { increment: 1 } },
      });
      throw new BadRequestException({
        code: 'VERIFICATION_CODE_MISMATCH',
        message: '인증번호가 올바르지 않아요.',
      });
    }

    if (!challenge.verifiedAt) {
      await this.prisma.v1PhoneVerificationChallenge.update({
        where: { phone },
        data: { verifiedAt: new Date() },
      });
    }
    return true;
  }

  issueProof(phone: string): string {
    return issuePhoneProofToken(phone);
  }

  // 마지막 발송 시각 = expiresAt - CODE_TTL_MS (verify 는 expiresAt 를 바꾸지 않으므로 신뢰 가능).
  // 쿨다운 내 재발송은 429 성격의 에러로 막아 동일 번호 유료 SMS 남용을 차단한다.
  private async assertResendCooldown(phone: string): Promise<void> {
    const existing = await this.prisma.v1PhoneVerificationChallenge.findUnique({
      where: { phone },
      select: { expiresAt: true },
    });
    if (!existing) return;
    const elapsed = Date.now() - (existing.expiresAt.getTime() - CODE_TTL_MS);
    if (elapsed < RESEND_COOLDOWN_MS) {
      const retryAfter = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
      throw new BadRequestException({
        code: 'VERIFICATION_RESEND_COOLDOWN',
        message: `잠시 후 다시 시도해 주세요. (${retryAfter}초 뒤에 다시 받을 수 있어요)`,
      });
    }
  }
}
