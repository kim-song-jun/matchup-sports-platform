import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import {
  ACTIVITY_PROFILE_ROUTE,
  getPendingSocialSignupRoute,
  isActivityProfileRequired,
  isPendingSocialSignupRequestAllowed,
} from './social-signup-access';
import type { V1AuthUser } from './v1-auth-user';
import { currentRuntimeConfiguration, resolveV1RequestIdentity, v1IdentityUserWhere } from './v1-session';
import { ManagedTermsRuntimeService } from '../terms/managed-terms-runtime.service';
import { isTermsReconsentRequestAllowed } from '../terms/terms-reconsent-access';
import {
  PHONE_VERIFICATION_ROUTE,
  isPhoneVerificationEnforced,
  isPhoneVerificationExemptActor,
  isPhoneVerificationRequestAllowed,
} from '../verification/phone-verification-access';

type V1Request = Request & { v1User?: V1AuthUser };

@Injectable()
export class V1AuthGuard implements CanActivate {
  private readonly logger = new Logger(V1AuthGuard.name);
  private readonly managedTerms: ManagedTermsRuntimeService;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() managedTerms?: ManagedTermsRuntimeService,
  ) {
    this.managedTerms = managedTerms ?? new ManagedTermsRuntimeService(prisma);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<V1Request>();
    const identity = resolveV1RequestIdentity(
      request,
      currentRuntimeConfiguration(),
    );

    if (!identity) {
      // [authdrop-diag] 임시 진단 — /my 간헐 401 원인 확정용. 확정 후 제거.
      // sessionCookieCount: 0=쿠키 자체가 안 실림(브라우저/수명주기 유실), 1=쿠키는 있는데
      // 서명·만료 검증 실패(서버 secret/토큰 문제), 2+=중복(apex/host-only 충돌).
      const cookieHeader = request.headers?.cookie ?? '';
      const cookieNames = cookieHeader
        .split(';')
        .map((c) => c.split('=')[0].trim())
        .filter(Boolean);
      const sessionCookieCount = cookieNames.filter((name) => name === 'teameet_v1_session').length;
      this.logger.warn(
        `[authdrop-diag] 401 !identity path=${request.originalUrl ?? request.url} ` +
          `sessionCookieCount=${sessionCookieCount} cookieNames=[${cookieNames.join(',')}]`,
      );
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'V1 authentication is required',
      });
    }

    const user = await this.prisma.v1User.findFirst({
      where: v1IdentityUserWhere(identity),
      select: {
        id: true,
        email: true,
        accountStatus: true,
        onboardingStatus: true,
        signupEmailLoginRequired: true,
        phoneVerifiedAt: true,
        // 휴대폰 인증 게이트의 관리자 면제 판정용. V1AdminUser.userId 가 @unique 라
        // 중첩 select 로 붙어 별도 쿼리가 생기지 않는다.
        adminUser: { select: { status: true } },
      },
    });

    if (!user) {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'V1 user was not found',
      });
    }

    if (['suspended', 'blocked', 'deleted', 'withdrawal_pending'].includes(user.accountStatus)) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: '이용이 제한된 계정이에요.',
      });
    }

    const pendingSignupRoute = getPendingSocialSignupRoute(user.onboardingStatus);
    if (
      pendingSignupRoute &&
      !isPendingSocialSignupRequestAllowed(user.onboardingStatus, request.originalUrl ?? request.url)
    ) {
      throw new ForbiddenException({
        code: 'SIGNUP_INCOMPLETE',
        message: 'Social signup must be completed before accessing this resource',
        details: { next: { route: pendingSignupRoute } },
      });
    }

    const requestUrl = request.originalUrl ?? request.url;
    if (!pendingSignupRoute && !isTermsReconsentRequestAllowed(requestUrl)) {
      const compliance = await this.managedTerms.signupCompliance(user.id);
      if (!compliance.compliant) {
        throw new ForbiddenException({
          code: 'TERMS_RECONSENT_REQUIRED',
          message: '새 필수 약관에 동의해야 계속할 수 있어요.',
          details: {
            pendingDocumentIds: compliance.pendingRequiredDocumentIds,
            next: { route: compliance.nextRoute },
          },
        });
      }
    }

    const pathname = requestUrl.split('?')[0]?.replace(/\/+$/, '') ?? '';
    const emailSetupAllowed = ['/auth/me', '/auth/logout', '/auth/link/email/request', '/auth/link/email/verify', '/auth/link/email/complete', '/terms/current', '/terms/consents', '/inquiries'].some((suffix) => pathname.endsWith(suffix));
    if (user.signupEmailLoginRequired && !emailSetupAllowed) {
      throw new ForbiddenException({
        code: 'EMAIL_LOGIN_SETUP_REQUIRED',
        message: '가입을 완료하려면 이메일 로그인 설정이 필요해요.',
        details: { next: { route: user.onboardingStatus === 'social_profile_deferred' ? '/my/settings/login-methods/email?redirect=%2Fhome' : '/my/settings/login-methods/email?redirect=%2Fonboarding%2Fsport' } },
      });
    }

    // 가입 정보 입력을 건너뛴 계정은 휴대폰 게이트와 같은 허용 목록 밖의 쓰기를 막는다.
    if (
      isActivityProfileRequired(user.onboardingStatus) &&
      !isPhoneVerificationExemptActor(user) &&
      !isPhoneVerificationRequestAllowed(request.method, requestUrl)
    ) {
      throw new ForbiddenException({
        code: 'ACTIVITY_PROFILE_REQUIRED',
        message: '활동하려면 정보를 먼저 입력해 주세요.',
        details: { next: { route: ACTIVITY_PROFILE_ROUTE } },
      });
    }

    // 휴대폰 본인인증 전역 게이트 — 조회는 열어 두고 쓰기만 막는다.
    // 프론트 리다이렉트는 UX일 뿐 강제력이 없어서(요청을 직접 보내면 그만) 서버가 최종 방어선이다.
    // 소셜 가입이 아직 안 끝난 계정은 위 signup 게이트가 이미 흐름을 통제하므로 여기서 다시 막지 않는다
    // — 가입 도중 인증 화면으로 튕겨 나가 가입을 끝낼 수 없게 되는 교착을 만들기 때문이다.
    if (
      !pendingSignupRoute &&
      isPhoneVerificationEnforced() &&
      !user.phoneVerifiedAt &&
      !isPhoneVerificationExemptActor(user) &&
      !isPhoneVerificationRequestAllowed(request.method, requestUrl)
    ) {
      throw new ForbiddenException({
        code: 'PHONE_VERIFICATION_REQUIRED',
        message: '휴대폰 본인인증을 완료해야 이용할 수 있어요.',
        details: { next: { route: PHONE_VERIFICATION_ROUTE } },
      });
    }

    request.v1User = user;
    return true;
  }
}
