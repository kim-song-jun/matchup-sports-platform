import { BadRequestException, Injectable } from '@nestjs/common';
import { randomInt } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { OctomoClient } from './octomo.client';
import { issuePhoneProofToken } from './phone-proof-token';

const CODE_TTL_MS = 5 * 60 * 1000;
const MAX_POLL_ATTEMPTS = 10;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

@Injectable()
export class PhoneVerificationService {
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

    const exists = this.octomo.enabled
      ? await this.octomo.messageExists(phone, challenge.code, 5)
      : this.devEcho;

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
