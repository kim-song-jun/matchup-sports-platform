import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomInt } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { OctomoClient } from './octomo.client';
import { issuePhoneProofToken } from './phone-proof-token';

const CODE_TTL_MS = 5 * 60 * 1000;
// 프론트가 발급 후 자동 폴링(2초 간격, 진입 즉시 1회)으로 도착을 감지한다.
// desktop은 QR 스캔·전송을 마치기 전부터 폴링이 돌기 때문에, 사용자가 문자를
// 보내기도 전에 상한이 소진돼 자멸하면 안 된다 → CODE_TTL(5분) 전체를 커버한다.
// 2초 간격 × 5분 = 최대 150회. 5분 만료(TTL)가 실질 상한이고, 이 값은 무한 폴링 백스톱이다.
const MAX_POLL_ATTEMPTS = 180;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
// 6자(≈10.7억) → 8자(≈1.1조)로 강화. 딥링크가 코드를 자동 삽입하므로 사용자 입력 부담이 없다.
const CODE_LENGTH = 8;

@Injectable()
export class PhoneVerificationService {
  private readonly logger = new Logger(PhoneVerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly octomo: OctomoClient,
  ) {}

  private get destNumber(): string {
    return process.env.OCTOMO_DEST_NUMBER ?? '16663538';
  }

  private get devEcho(): boolean {
    return process.env.V1_VERIFICATION_DEV_ECHO === 'true';
  }

  get enabled(): boolean {
    return this.octomo.enabled || this.devEcho;
  }

  async issueChallenge(phone: string, channel: 'mobile' | 'desktop') {
    const code = this.generateCode();
    const expiresAt = new Date(Date.now() + CODE_TTL_MS);
    await this.prisma.v1PhoneVerificationChallenge.upsert({
      where: { phone },
      update: { code, channel, expiresAt, attemptCount: 0, verifiedAt: null },
      create: { phone, code, channel, expiresAt },
    });

    let qrCode: string | undefined;
    if (channel === 'desktop' && this.octomo.enabled) {
      qrCode = await this.octomo.createQrCode(code);
    }

    return { code, destNumber: this.destNumber, qrCode, expiresAt: expiresAt.toISOString() };
  }

  async pollArrived(phone: string): Promise<boolean> {
    const challenge = await this.prisma.v1PhoneVerificationChallenge.findUnique({ where: { phone } });
    if (!challenge || challenge.expiresAt.getTime() < Date.now()) return false;
    if (challenge.attemptCount >= MAX_POLL_ATTEMPTS) {
      throw new BadRequestException({
        code: 'VERIFICATION_TOO_MANY_ATTEMPTS',
        message: '확인 시도가 너무 많아요. 인증번호를 다시 받아 주세요.',
      });
    }

    await this.prisma.v1PhoneVerificationChallenge.update({
      where: { phone },
      data: { attemptCount: { increment: 1 } },
    });

    let exists = false;
    if (this.octomo.enabled) {
      try {
        exists = await this.octomo.messageExists(phone, challenge.code, 5);
      } catch (err) {
        // 옥토모 일시 오류·timeout·rate-limit은 "아직 도착 안 함"으로 흡수해, 폴링이 다음 주기에
        // 재시도하게 한다. 여기서 throw하면 매 폴링이 500이 되고 커넥션이 쌓여 upstream이 죽는다.
        this.logger.warn(`octomo messageExists failed during poll: ${err instanceof Error ? err.message : String(err)}`);
        return false;
      }
    } else {
      exists = this.devEcho;
    }

    if (exists) {
      await this.prisma.v1PhoneVerificationChallenge.update({ where: { phone }, data: { verifiedAt: new Date() } });
    }
    return exists;
  }

  issueProof(phone: string): string {
    return issuePhoneProofToken(phone);
  }

  private generateCode(): string {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i += 1) {
      code += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
    }
    return code;
  }
}
