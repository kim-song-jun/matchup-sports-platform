import { BadRequestException, ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AdminContextService } from '../common/admin-context.service';
import { currentRuntimeConfiguration, readCurrentV1SessionAgeSeconds, readV1Session, V1_SESSION_COOKIE_NAME } from '../auth/v1-session';
import { memberAccessBinding, memberAccessCookie, MEMBER_ACCESS_TTL_MS, readMemberAccess, signMemberAccess } from '../auth/member-access-token';

const START = 'user.member_access.start';
const END = 'user.member_access.end';
type AccessData = { operatorUserId: string; operatorEpoch: number; targetEpoch: number; binding: string; expiresAt: string };
type AccessRequest = Pick<Request, 'headers'>;

function accessData(value: Prisma.JsonValue | null): AccessData | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { operatorUserId, operatorEpoch, targetEpoch, binding, expiresAt } = value;
  if (typeof operatorUserId !== 'string' || typeof operatorEpoch !== 'number' || typeof targetEpoch !== 'number'
    || !Number.isInteger(operatorEpoch) || !Number.isInteger(targetEpoch)
    || typeof binding !== 'string' || typeof expiresAt !== 'string' || !Number.isFinite(Date.parse(expiresAt))) return null;
  return { operatorUserId, operatorEpoch, targetEpoch, binding, expiresAt };
}

@Injectable()
export class MemberAccessService {
  constructor(private readonly prisma: PrismaService, private readonly admins: AdminContextService) {}

  private runtime() {
    const secret = currentRuntimeConfiguration().sessionSecret;
    if (!secret || secret.length < 32) throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: '다시 로그인해 주세요.' });
    return secret;
  }

  private original(request: AccessRequest) {
    const raw = memberAccessCookie(request.headers.cookie, V1_SESSION_COOKIE_NAME);
    const session = readV1Session(request.headers.cookie, { secret: this.runtime() });
    if (!raw || !session) throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: '관리자 계정으로 다시 로그인해 주세요.' });
    return { ...session, binding: memberAccessBinding(raw) };
  }

  async start(request: AccessRequest, userId: string, rawReason: string) {
    if (memberAccessCookie(request.headers.cookie)) throw new ConflictException({ code: 'MEMBER_ACCESS_ACTIVE', message: '현재 회원 조회를 먼저 종료해 주세요.' });
    const original = this.original(request);
    const age = readCurrentV1SessionAgeSeconds(request.headers.cookie);
    if (age === null || age > 30 * 60) throw new ForbiddenException({ code: 'RECENT_LOGIN_REQUIRED', message: '회원 조회를 시작하려면 관리자 계정으로 다시 로그인해 주세요.' });
    const reason = rawReason.trim();
    if (reason.length < 5 || reason.length > 500) throw new BadRequestException({ code: 'MEMBER_ACCESS_REASON_REQUIRED', message: '접속 사유를 5~500자로 입력해 주세요.' });
    const expiresAt = new Date(Date.now() + MEMBER_ACCESS_TTL_MS);
    const grant = await this.prisma.$transaction(async (tx) => {
      // Hold actor/target identity and admin grants stable until the audit grant commits.
      await tx.$queryRaw`SELECT id FROM v1_admin_users WHERE user_id IN (${original.userId}, ${userId}) ORDER BY id FOR SHARE`;
      await tx.$queryRaw`SELECT id FROM v1_users WHERE id IN (${original.userId}, ${userId}) ORDER BY id FOR SHARE`;
      const admin = await this.admins.getMutationAdmin(original.userId, tx);
      const operator = await tx.v1User.findUniqueOrThrow({ where: { id: original.userId }, select: { sessionEpoch: true } });
      if (operator.sessionEpoch !== original.sessionEpoch) throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: '관리자 세션이 만료됐어요.' });
      const target = await tx.v1User.findUnique({ where: { id: userId }, select: {
        id: true, accountStatus: true, sessionEpoch: true, adminUser: { select: { status: true } }, profile: { select: { nickname: true } },
      } });
      if (!target || target.accountStatus !== 'active' || target.id === admin.userId || target.adminUser?.status === 'active') {
        throw new ForbiddenException({ code: 'MEMBER_ACCESS_UNAVAILABLE', message: '활성 일반 회원만 조회할 수 있어요. 운영자 계정은 대상에서 제외돼요.' });
      }
      const log = await tx.v1AdminActionLog.create({ data: { adminUserId: admin.id, action: START, targetType: 'user', targetId: userId, reason,
        afterJson: { operatorUserId: admin.userId, operatorEpoch: original.sessionEpoch, targetEpoch: target.sessionEpoch,
          binding: original.binding, expiresAt: expiresAt.toISOString(), mode: 'read_only' } } });
      return { id: log.id, label: target.profile?.nickname ?? '회원' };
    });
    return { token: signMemberAccess(grant.id, this.runtime()), userId, label: grant.label, expiresAt: expiresAt.toISOString() };
  }

  private async grant(request: AccessRequest) {
    const id = readMemberAccess(memberAccessCookie(request.headers.cookie), this.runtime());
    if (!id) throw new ForbiddenException({ code: 'MEMBER_ACCESS_INVALID', message: '회원 조회 세션을 확인할 수 없어요. 관리자 복귀를 눌러 주세요.' });
    const row = await this.prisma.v1AdminActionLog.findUnique({ where: { id } });
    const data = accessData(row?.afterJson ?? null);
    const raw = memberAccessCookie(request.headers.cookie, V1_SESSION_COOKIE_NAME);
    if (!row || row.action !== START || row.targetType !== 'user' || !data || !raw || data.binding !== memberAccessBinding(raw)) {
      throw new ForbiddenException({ code: 'MEMBER_ACCESS_INVALID', message: '회원 조회 세션을 확인할 수 없어요. 관리자 복귀를 눌러 주세요.' });
    }
    return { row, data };
  }

  private ended(id: string, targetId: string) {
    return this.prisma.v1AdminActionLog.findFirst({ where: { action: END, targetType: 'user', targetId,
      afterJson: { path: ['accessId'], equals: id } }, select: { id: true } });
  }

  private async end(row: { id: string; adminUserId: string; targetId: string }, endReason: string, effectiveAt = new Date().toISOString()) {
    if (await this.ended(row.id, row.targetId)) return;
    await this.prisma.v1AdminActionLog.create({ data: { adminUserId: row.adminUserId, action: END, targetType: 'user', targetId: row.targetId,
      reason: endReason, afterJson: { accessId: row.id, endReason, endedAt: effectiveAt } } });
  }

  async authorize(request: AccessRequest) {
    const { row, data } = await this.grant(request);
    const original = this.original(request);
    if (original.userId !== data.operatorUserId || original.sessionEpoch !== data.operatorEpoch) {
      throw new ForbiddenException({ code: 'MEMBER_ACCESS_INVALID', message: '관리자 세션이 변경됐어요. 관리자 복귀를 눌러 주세요.' });
    }
    if (Date.parse(data.expiresAt) <= Date.now()) {
      await this.end(row, 'expired', data.expiresAt);
      throw new ForbiddenException({ code: 'MEMBER_ACCESS_EXPIRED', message: '회원 조회 시간이 만료됐어요. 관리자 복귀를 눌러 주세요.' });
    }
    if (await this.ended(row.id, row.targetId)) throw new ForbiddenException({ code: 'MEMBER_ACCESS_ENDED', message: '종료된 회원 조회예요. 관리자 복귀를 눌러 주세요.' });
    const admin = await this.admins.getMutationAdmin(original.userId).catch(async (error: unknown) => {
      if (error instanceof ForbiddenException) await this.end(row, 'authorization_changed');
      throw error;
    });
    const [operator, target] = await Promise.all([
      this.prisma.v1User.findUnique({ where: { id: original.userId }, select: { sessionEpoch: true } }),
      this.prisma.v1User.findUnique({ where: { id: row.targetId }, select: { accountStatus: true, sessionEpoch: true,
        adminUser: { select: { status: true } }, profile: { select: { nickname: true } } } }),
    ]);
    if (admin.id !== row.adminUserId || operator?.sessionEpoch !== data.operatorEpoch || target?.accountStatus !== 'active'
      || target.sessionEpoch !== data.targetEpoch || target.adminUser?.status === 'active') {
      await this.end(row, 'authorization_changed');
      throw new ForbiddenException({ code: 'MEMBER_ACCESS_REVOKED', message: '계정이나 권한이 변경되어 회원 조회를 종료했어요. 관리자 복귀를 눌러 주세요.' });
    }
    return { userId: row.targetId, sessionEpoch: data.targetEpoch, label: target.profile?.nickname ?? '회원', expiresAt: data.expiresAt };
  }

  async status(request: AccessRequest) {
    if (!memberAccessCookie(request.headers.cookie)) return { active: false as const };
    try { return { active: true as const, ...(await this.authorize(request)) }; }
    catch (error) {
      if (!(error instanceof ForbiddenException || error instanceof UnauthorizedException)) throw error;
      const response = error.getResponse();
      return { active: true as const, unavailable: true as const,
        message: typeof response === 'object' && 'message' in response ? String(response.message) : '회원 조회를 종료해 주세요.' };
    }
  }

  async stop(request: AccessRequest) {
    if (!memberAccessCookie(request.headers.cookie)) return { returnPath: '/admin/users' };
    let targetId: string | null = null;
    try {
      const { row } = await this.grant(request);
      await this.end(row, 'operator_stopped');
      targetId = row.targetId;
    } catch (error) {
      // A malformed or mismatched cookie carries no usable grant; only remove that cookie.
      if (!(error instanceof ForbiddenException || error instanceof UnauthorizedException)) throw error;
    }
    return { returnPath: targetId ? `/admin/users/${encodeURIComponent(targetId)}` : '/admin/users' };
  }
}
