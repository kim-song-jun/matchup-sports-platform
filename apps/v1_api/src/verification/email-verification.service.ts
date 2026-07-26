import { BadRequestException, Injectable } from '@nestjs/common';
import { randomInt } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword, verifyPassword } from '../auth/password-hash';
import { normalizeEmail } from '../auth/normalize-email';
import { issueEmailProofToken } from './email-proof-token';
import { SMS_EVENT_TYPE, SmsEventLogService, type SmsEventType } from './sms-event-log.service';
import { VerificationDispatcherService } from './verification-dispatcher.service';

const CODE_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
/** 같은 주소로 메일을 반복 발송(메일폭탄·발신 평판 훼손)하지 못하게 막는 재발송 쿨다운. */
const RESEND_COOLDOWN_MS = 30 * 1000;

/**
 * 비로그인(pre-session) 이메일 OTP — 비밀번호 재설정 전용.
 *
 * 로그인 후 이메일 인증(VerificationService)과 저장소부터 다르다. 그쪽은 userId 가 있는
 * V1VerificationToken 을 쓰지만, 여기서는 요청자가 누구인지 모르고 **가입되지 않은 주소로도
 * 똑같이 챌린지를 만들어야** 한다 — 안 만들면 "행이 없는 주소"만 응답·에러가 갈려 이메일
 * 하나로 가입 여부를 훑을 수 있다(계정 열거).
 *
 * 그래서 메일 발송 여부(deliver)만 호출자가 정하고, 챌린지 생성·쿨다운·시도 상한은 가입
 * 여부와 무관하게 항상 같은 경로를 탄다. 가입 안 된 주소는 아무도 코드를 받지 못하므로
 * 대조가 성공할 수 없고, 실패 모습은 "코드를 틀린 것"과 구분되지 않는다.
 */
@Injectable()
export class EmailVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatcher: VerificationDispatcherService,
    private readonly smsEventLog: SmsEventLogService,
  ) {}

  /**
   * @param deliver 실제로 메일을 보낼지. false 여도 챌린지는 똑같이 만들어 응답을 맞춘다.
   */
  async issueChallenge(
    rawEmail: string,
    { deliver }: { deliver: boolean },
  ): Promise<{ expiresAt: string; devCode?: string }> {
    const email = normalizeEmail(rawEmail);
    await this.assertResendCooldown(email);
    await this.sweepExpired();

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const codeHash = await hashPassword(code);
    const expiresAt = new Date(Date.now() + CODE_TTL_MS);

    await this.prisma.v1EmailVerificationChallenge.upsert({
      where: { email },
      update: { codeHash, expiresAt, attemptCount: 0, verifiedAt: null },
      create: { email, codeHash, expiresAt },
    });

    if (!deliver) {
      // 가입 안 된 주소. 코드는 아무에게도 가지 않으므로 devCode 도 내리지 않는다 —
      // dev-echo 를 켜 둔 환경에서 그 값이 곧 "이 주소는 가입돼 있다"는 신호가 되기 때문.
      return { expiresAt: expiresAt.toISOString() };
    }

    try {
      await this.dispatcher.send('email', email, code, 'password_reset');
    } catch (err) {
      // 발송 실패 시 방금 만든 챌린지를 정리해, 사용자가 재발송 쿨다운에 걸리지 않고 즉시 재요청할 수 있게 한다.
      await this.prisma.v1EmailVerificationChallenge.deleteMany({ where: { email } });
      throw err;
    }

    return {
      expiresAt: expiresAt.toISOString(),
      ...(this.dispatcher.devEchoActive ? { devCode: code } : {}),
    };
  }

  async verifyCode(rawEmail: string, code: string): Promise<boolean> {
    const email = normalizeEmail(rawEmail);
    const challenge = await this.prisma.v1EmailVerificationChallenge.findUnique({ where: { email } });
    if (!challenge || challenge.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException({
        code: 'VERIFICATION_NO_PENDING',
        message: '유효한 인증 요청이 없어요. 인증번호를 다시 받아 주세요.',
      });
    }
    // verifiedAt 여부와 무관하게 항상 제출된 코드를 codeHash 와 대조한다 — verifiedAt 만으로
    // 단락하면 주소만 아는 쪽이 임의 코드로 증명 토큰을 가져갈 수 있다.
    // 올바른 코드 재제출은 그대로 멱등 성공한다.
    const matches = await verifyPassword(code, challenge.codeHash);
    if (!matches) {
      // 시도 상한은 '불일치' 경로에서만 적용한다 — 올바른 코드 재제출까지 막지 않기 위해서다.
      if (challenge.attemptCount >= MAX_ATTEMPTS) {
        await this.recordFailure(SMS_EVENT_TYPE.TOO_MANY_ATTEMPTS, `인증 시도 ${challenge.attemptCount}회 초과`);
        throw new BadRequestException({
          code: 'VERIFICATION_TOO_MANY_ATTEMPTS',
          message: '시도 횟수를 초과했어요. 인증번호를 다시 받아 주세요.',
        });
      }
      await this.prisma.v1EmailVerificationChallenge.update({
        where: { email },
        data: { attemptCount: { increment: 1 } },
      });
      await this.recordFailure(
        SMS_EVENT_TYPE.CODE_MISMATCH,
        `인증 시도 ${challenge.attemptCount + 1}/${MAX_ATTEMPTS}`,
      );
      throw new BadRequestException({
        code: 'VERIFICATION_CODE_MISMATCH',
        message: '인증번호가 올바르지 않아요.',
      });
    }

    if (!challenge.verifiedAt) {
      await this.prisma.v1EmailVerificationChallenge.update({
        where: { email },
        data: { verifiedAt: new Date() },
      });
    }
    return true;
  }

  /** 이 흐름이 발급할 수 있는 증명은 비밀번호 재설정용 하나뿐이다(용도를 요청자가 고르지 못한다). */
  issueProof(email: string): string {
    return issueEmailProofToken(normalizeEmail(email), 'password_reset');
  }

  /**
   * 만료된 챌린지를 치운다.
   *
   * 이 표는 가입 여부와 무관하게 행이 생기므로(계정 열거 방어) 남겨 두면 시도된 주소 수만큼
   * 끝없이 자란다 — 로그인도 필요 없는 공개 경로라 상한이 레이트리밋뿐이다. 만료된 행은
   * verifyCode 가 어차피 NO_PENDING 으로 거부하고 쿨다운(30초)도 TTL(5분)보다 짧아,
   * 지워도 달라지는 동작이 없다. 별도 스케줄러 없이 발급 때마다 함께 치워 표를 짧게 유지한다.
   */
  private async sweepExpired(): Promise<void> {
    await this.prisma.v1EmailVerificationChallenge.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
  }

  // 마지막 발송 시각 = expiresAt - CODE_TTL_MS (verify 는 expiresAt 를 바꾸지 않으므로 신뢰 가능).
  private async assertResendCooldown(email: string): Promise<void> {
    const existing = await this.prisma.v1EmailVerificationChallenge.findUnique({
      where: { email },
      select: { expiresAt: true },
    });
    if (!existing) return;
    const elapsed = Date.now() - (existing.expiresAt.getTime() - CODE_TTL_MS);
    if (elapsed < RESEND_COOLDOWN_MS) {
      const retryAfter = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
      await this.recordFailure(SMS_EVENT_TYPE.RESEND_COOLDOWN, `재발송 쿨다운 ${retryAfter}초 남음`);
      throw new BadRequestException({
        code: 'VERIFICATION_RESEND_COOLDOWN',
        message: `잠시 후 다시 시도해 주세요. (${retryAfter}초 뒤에 다시 받을 수 있어요)`,
      });
    }
  }

  /**
   * 인증 실패 트래킹은 채널과 무관하게 한 곳(V1SmsEventLog)에 모은다. 대상 식별자 컬럼은
   * 번호 끝 4자리라 이메일은 항상 '****' 로 남는다 — 어느 흐름인지는 detail 로 구분한다.
   * 대상 주소를 남기지 않는 것은 의도된 것이다(로그에서 계정 열거가 되면 안 된다).
   */
  private async recordFailure(eventType: SmsEventType, detail: string): Promise<void> {
    await this.smsEventLog.record({
      eventType,
      phone: '',
      detail: `channel=email-recovery ${detail}`,
    });
  }
}
