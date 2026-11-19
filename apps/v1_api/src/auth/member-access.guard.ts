import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { MemberAccessService } from '../admin/member-access.service';
import { memberAccessCookie, MEMBER_ACCESS_CONTROL_PATH } from './member-access-token';
import { setMemberAccessIdentity } from './request-identity-override';

@Injectable()
export class MemberAccessGuard implements CanActivate {
  constructor(private readonly access: MemberAccessService) {}
  async canActivate(context: ExecutionContext) {
    if (context.getType() !== 'http') return true;
    const request = context.switchToHttp().getRequest<Request>();
    if (!memberAccessCookie(request.headers.cookie)) return true;
    const path = (request.originalUrl ?? request.url).split('?')[0].replace(/\/+$/, '');
    if ((path === MEMBER_ACCESS_CONTROL_PATH && request.method === 'GET')
      || (path === `${MEMBER_ACCESS_CONTROL_PATH}/stop` && request.method === 'POST')) return true;
    const target = await this.access.authorize(request);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      throw new ForbiddenException({ code: 'MEMBER_ACCESS_READ_ONLY', message: '회원 조회 중에는 신청·수정·전송할 수 없어요. 관리자 복귀 후 처리해 주세요.' });
    }
    const authRoute = path.startsWith('/api/v1/auth/') && !['/api/v1/auth/me', '/api/v1/auth/check-email', '/api/v1/auth/check-nickname'].includes(path);
    if (/^\/api\/v1\/(admin|tournament-ops)(\/|$)/.test(path) || authRoute) {
      throw new ForbiddenException({ code: 'MEMBER_ACCESS_SCOPE_DENIED', message: '회원 조회 중에는 운영·인증 기능을 사용할 수 없어요. 관리자 복귀를 눌러 주세요.' });
    }
    setMemberAccessIdentity(request, { kind: 'user_id', userId: target.userId, sessionEpoch: target.sessionEpoch });
    return true;
  }
}
