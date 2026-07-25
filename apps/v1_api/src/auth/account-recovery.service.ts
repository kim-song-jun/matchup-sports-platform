import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { V1AuthProvider } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { verifyPhoneProofToken } from '../verification/phone-proof-token';
import { hashPassword } from './password-hash';
import { FindAccountDto, ResetPasswordDto } from './dto/account-recovery.dto';

/**
 * 이메일 앞 2자만 남기고 가린다 — 본인이면 알아볼 수 있고, 번호만 탈취한 쪽에는
 * 전체 주소를 넘겨주지 않는다. 로컬파트가 2자 이하면 아예 드러내지 않는다.
 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  const head = local.length > 2 ? local.slice(0, 2) : '';
  return `${head}***@${domain}`;
}

export interface FoundAccount {
  /** 마스킹된 로그인 이메일. 소셜 전용 계정이라 이메일 로그인이 불가능하면 null. */
  maskedEmail: string | null;
  /** 이 계정으로 로그인할 수 있는 수단 — 화면이 "카카오로 로그인하세요"를 안내하는 근거. */
  providers: string[];
  hasPassword: boolean;
}

@Injectable()
export class AccountRecoveryService {
  constructor(private readonly prisma: PrismaService) {}

  async findAccountByPhone(dto: FindAccountDto): Promise<FoundAccount> {
    const user = await this.assertPhoneOwner(dto.phone, dto.proofToken);

    return {
      maskedEmail: user.email ? maskEmail(user.email) : null,
      providers: user.authIdentities.map((identity) => identity.provider),
      hasPassword: user.authIdentities.some((identity) => Boolean(identity.passwordHash)),
    };
  }

  async resetPasswordByPhone(dto: ResetPasswordDto): Promise<{ ok: true }> {
    const user = await this.assertPhoneOwner(dto.phone, dto.proofToken);

    const emailIdentity = user.authIdentities.find(
      (identity) => identity.provider === V1AuthProvider.email,
    );
    // 카카오로만 가입한 계정은 비밀번호라는 개념이 없다. 여기서 비밀번호를 새로 만들어 주면
    // 소셜 전용 계정에 이메일 로그인 경로를 몰래 열어 주는 셈이라, 안내로 되돌린다.
    if (!emailIdentity) {
      throw new BadRequestException({
        code: 'PASSWORD_LOGIN_UNAVAILABLE',
        message: '이 계정은 카카오 로그인으로 가입했어요. 카카오로 로그인해 주세요.',
      });
    }

    await this.prisma.v1AuthIdentity.update({
      where: { id: emailIdentity.id },
      data: { passwordHash: await hashPassword(dto.newPassword) },
    });

    return { ok: true };
  }

  /**
   * 이 번호의 주인임을 증명한 요청만 통과시킨다. 증명 토큰은 'password_reset' 용도로 발급된
   * 것이어야 한다 — 가입용 토큰이 그대로 통하면 가입 흐름의 증명으로 남의 비밀번호를
   * 바꿀 수 있게 된다.
   */
  private async assertPhoneOwner(phone: string, proofToken: string) {
    if (!verifyPhoneProofToken(proofToken, phone, 'password_reset')) {
      throw new BadRequestException({
        code: 'PHONE_NOT_VERIFIED',
        message: '휴대폰 본인인증을 다시 진행해 주세요.',
      });
    }

    const user = await this.prisma.v1User.findFirst({
      where: { phone, accountStatus: 'active' },
      select: {
        id: true,
        email: true,
        authIdentities: {
          where: { status: 'active' },
          select: { id: true, provider: true, passwordHash: true },
        },
      },
    });

    // 번호 주인임을 이미 증명한 뒤라, 가입 여부를 알려 줘도 남의 정보가 새지 않는다
    // (증명 없이 조회하게 두면 번호만으로 가입 여부를 훑을 수 있어 그때는 감춰야 한다).
    if (!user) {
      throw new NotFoundException({
        code: 'ACCOUNT_NOT_FOUND',
        message: '이 번호로 가입된 계정을 찾지 못했어요.',
      });
    }

    return user;
  }
}
