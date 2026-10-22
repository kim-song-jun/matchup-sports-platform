import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { V1AuthProvider } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailVerificationService } from '../verification/email-verification.service';
import { verifyEmailProofToken } from '../verification/email-proof-token';
import { verifyPhoneProofToken } from '../verification/phone-proof-token';
import { LoginSecurityService } from './login-security/login-security.service';
import { normalizeEmail } from './normalize-email';
import { hashPassword } from './password-hash';
import {
  EmailRecoveryConfirmDto,
  EmailRecoveryRequestDto,
  FindAccountDto,
  ResetPasswordByEmailDto,
  ResetPasswordDto,
} from './dto/account-recovery.dto';

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
  private readonly logger = new Logger(AccountRecoveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailVerification: EmailVerificationService,
    private readonly loginSecurity: LoginSecurityService,
  ) {}

  async findAccountByPhone(dto: FindAccountDto): Promise<FoundAccount> {
    const user = await this.assertPhoneOwner(dto.phone, dto.proofToken);

    return {
      maskedEmail: user.email ? maskEmail(user.email) : null,
      providers: user.authIdentities.map((identity) => identity.provider),
      hasPassword: user.authIdentities.some((identity) => Boolean(identity.passwordHash)),
    };
  }

  async resetPasswordByPhone(dto: ResetPasswordDto): Promise<{ ok: true }> {
    await this.assertPhoneOwner(dto.phone, dto.proofToken);
    // Current SMS possession does not prove ownership of the existing account.
    throw new ConflictException({
      code: 'ACCOUNT_RECOVERY_REQUIRES_EMAIL',
      message: '휴대폰 번호 인증만으로 기존 계정의 비밀번호를 바꿀 수 없어요. 이메일 본인 확인으로 재설정하거나 처음 가입한 방법으로 로그인해 주세요.',
    });
  }

  /**
   * 이메일로 인증번호 보내기 — 비밀번호 재설정 전용.
   *
   * 휴대폰 경로와 달리 이메일은 **아무나 아무 주소로** 시도할 수 있다. 그래서 가입 여부가
   * 응답에 드러나면 안 된다: 가입된 주소든 아니든 같은 200 을 돌려주고, 챌린지도 똑같이
   * 만든다(EmailVerificationService). 메일을 실제로 보내는 것만 가입된 주소로 한정한다 —
   * 가입 안 된 주소는 코드를 받는 사람이 없으므로 대조가 성공할 수 없고, 그 실패는 "코드를
   * 틀린 것"과 구분되지 않는다.
   *
   * 카카오 전용 계정도 메일은 보낸다. 사서함 주인임을 증명한 다음에 "카카오로 로그인하세요"를
   * 안내하는 편이, 요청 단계에서 계정 종류를 흘리는 것보다 안전하면서 안내도 정확하다.
   */
  async requestPasswordResetEmail(
    dto: EmailRecoveryRequestDto,
  ): Promise<{ sent: true; expiresAt: string; devCode?: string }> {
    const email = normalizeEmail(dto.email);
    const account = await this.findActiveUserByEmail(email);
    const issued = await this.emailVerification.issueChallenge(email, {
      deliver: account !== null,
    });
    return { sent: true, ...issued };
  }

  /** 인증번호 대조 → 이 주소의 사서함 주인이라는 증명(비밀번호 재설정 전용) 발급. */
  async confirmPasswordResetEmail(
    dto: EmailRecoveryConfirmDto,
  ): Promise<{ verified: true; proofToken: string }> {
    await this.emailVerification.verifyCode(dto.email, dto.code);
    return { verified: true, proofToken: this.emailVerification.issueProof(dto.email) };
  }

  async resetPasswordByEmail(dto: ResetPasswordByEmailDto): Promise<{ ok: true }> {
    const email = normalizeEmail(dto.email);
    // 이메일 증명은 휴대폰 증명과 페이로드가 갈려 있어 서로 통하지 않는다(email-proof-token).
    if (!verifyEmailProofToken(dto.proofToken, email, 'password_reset')) {
      throw new BadRequestException({
        code: 'EMAIL_NOT_VERIFIED',
        message: '이메일 본인인증을 다시 진행해 주세요.',
      });
    }

    const user = await this.findActiveUserByEmail(email);
    // 사서함 주인임을 이미 증명한 뒤라, 가입 여부를 알려 줘도 남의 정보가 새지 않는다
    // (증명 전 단계인 requestPasswordResetEmail 에서는 그래서 아무것도 드러내지 않는다).
    if (!user) {
      throw new NotFoundException({
        code: 'ACCOUNT_NOT_FOUND',
        message: '이 이메일로 가입된 계정을 찾지 못했어요.',
      });
    }

    return this.applyNewPassword(user, email, dto.newPassword);
  }

  /**
   * 이메일 본인 확인을 마친 계정의 비밀번호를 바꾼다. 기존 이메일 로그인 신원만 허용해
   * 소셜 전용 계정에 새 이메일 로그인 경로가 열리지 않도록 한다.
   */
  private async applyNewPassword(
    user: { authIdentities: { id: string; provider: string }[] },
    email: string,
    newPassword: string,
  ): Promise<{ ok: true }> {
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
      data: { passwordHash: await hashPassword(newPassword) },
    });
    await this.releaseLoginRestrictions(email);

    return { ok: true };
  }

  /**
   * 사서함 주인이 새 비밀번호를 정했으니 이 이메일의 로그인 제한(실패 기록·추가 인증 발송 횟수·열린 챌린지)을 푼다.
   * 이미 바뀐 비밀번호를 되돌릴 수는 없으므로 정리가 실패해도 재설정은 성공으로 두고 로그만 남긴다.
   */
  private async releaseLoginRestrictions(email: string): Promise<void> {
    try {
      await this.loginSecurity.forgetEmail(email);
    } catch (error) {
      this.logger.error(
        `login restrictions were not cleared after a password reset: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * 로그인 이메일로 활성 계정을 찾는다. 로그인은 V1AuthIdentity(provider=email) 를 키로 쓰지만
   * 여기서는 V1User.email 로 찾는다 — 카카오 전용 계정에는 이메일 신원이 없어서, 신원으로만
   * 찾으면 그 계정에 "카카오로 로그인하세요" 안내조차 못 하게 된다.
   * (두 값은 가입·이메일 인증 시 함께 갱신돼 항상 같은 표준형을 가리킨다.)
   */
  private async findActiveUserByEmail(email: string) {
    return this.prisma.v1User.findFirst({
      where: { email, accountStatus: 'active' },
      select: {
        id: true,
        email: true,
        authIdentities: {
          where: { status: 'active' },
          select: { id: true, provider: true, passwordHash: true },
        },
      },
    });
  }

  /**
   * 현재 휴대폰 번호를 인증한 요청에만 계정 찾기를 허용한다. 호환된 복구 증명은
   * 'password_reset' 용도여야 하며 가입·소셜 연결 증명과 구분한다. 이 증명만으로
   * 기존 계정의 비밀번호를 변경할 수는 없다.
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
