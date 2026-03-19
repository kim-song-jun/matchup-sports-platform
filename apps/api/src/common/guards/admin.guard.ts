import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

/**
 * Admin Guard — 관리자 권한 확인
 *
 * 현재는 단순 구현 (모든 로그인 사용자 허용)
 * TODO: User 모델에 role 필드 추가 후 실제 권한 체크
 *
 * 권한 구조:
 * - super_admin: 전체 시스템 관리
 * - team_admin: 자기 팀 관리만
 * - user: 일반 사용자
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('로그인이 필요합니다');
    }

    // TODO: 실제 역할 기반 권한 체크
    // if (user.role !== 'super_admin' && user.role !== 'team_admin') {
    //   throw new ForbiddenException('관리자 권한이 필요합니다');
    // }

    return true;
  }
}

/**
 * Team Owner Guard — 팀 소유자 권한 확인
 */
@Injectable()
export class TeamOwnerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('로그인이 필요합니다');
    }

    // TODO: 팀 소유자인지 확인하는 로직
    // const teamId = request.params.teamId;
    // if (team.ownerId !== user.id) throw new ForbiddenException();

    return true;
  }
}
