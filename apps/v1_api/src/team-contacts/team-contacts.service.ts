import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { V1AuthUser } from '../auth/v1-auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTeamContactDto } from './dto/team-contact.dto';

/** 한 팀이 24시간 동안 보낼 수 있는 컨택 수. 확정값 — 스펙 §2. */
const DAILY_SEND_LIMIT = 10;
/** 무응답 컨택이 만료되기까지의 일수. 확정값 — 스펙 §6. */
const EXPIRY_DAYS = 7;
/** 새 컨택을 막는 "진행 중" 상태들. accepted 를 포함해야 채팅방 파편화를 막는다. */
const ACTIVE_STATUSES = ['requested', 'accepted'] as const;

// 이 레포는 공용 에러 헬퍼를 두지 않고 파일마다 로컬로 중복 정의한다
// (chat/matches/team-matches/teams 4개 서비스가 각각 같은 함수를 갖고 있다).
function stateConflict(message: string, code = 'STATE_CONFLICT', details?: unknown) {
  return new ConflictException({ code, message, details });
}

@Injectable()
export class TeamContactsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: V1AuthUser, toTeamId: string, dto: CreateTeamContactDto) {
    await this.assertCanManageTeam(user.id, dto.fromTeamId);

    if (dto.fromTeamId === toTeamId) {
      throw stateConflict('같은 팀에는 컨택을 보낼 수 없어요.', 'TEAM_CONTACT_SELF_NOT_ALLOWED');
    }

    const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    return this.prisma.$transaction(async (tx) => {
      // 락 키의 팀 id 를 정렬한다. A→B 와 B→A 가 같은 락을 잡아야 양방향 중복 검사가
      // 실제로 상호배제된다 — 정렬하지 않으면 두 방향이 서로 다른 락을 잡고 동시 통과한다.
      const [left, right] = [dto.fromTeamId, toTeamId].sort();
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`team-contact:${left}:${right}`}, 0))`;

      const active = await tx.v1TeamContact.findFirst({
        where: {
          status: { in: [...ACTIVE_STATUSES] },
          OR: [
            { fromTeamId: dto.fromTeamId, toTeamId },
            { fromTeamId: toTeamId, toTeamId: dto.fromTeamId },
          ],
        },
        select: { id: true, status: true },
      });
      if (active) {
        throw stateConflict(
          '이미 이 팀과 진행 중인 컨택이 있어요.',
          'TEAM_CONTACT_ALREADY_ACTIVE',
          { existingContactId: active.id, existingStatus: active.status },
        );
      }

      const sentToday = await tx.v1TeamContact.count({
        where: { fromTeamId: dto.fromTeamId, createdAt: { gte: since } },
      });
      if (sentToday >= DAILY_SEND_LIMIT) {
        throw stateConflict(
          '오늘 보낼 수 있는 컨택을 모두 사용했어요. 내일 다시 시도해 주세요.',
          'TEAM_CONTACT_DAILY_LIMIT_EXCEEDED',
        );
      }

      return tx.v1TeamContact.create({
        data: {
          fromTeamId: dto.fromTeamId,
          toTeamId,
          requestedByUserId: user.id,
          message: dto.message,
          expiresAt,
        },
      });
    });
  }

  // team-matches.service.ts 의 동명 private 메서드와 같은 패턴이다.
  // 이 레포에는 공유 권한 서비스가 없고 각 서비스가 자기 파일 안에서 중복 구현한다.
  private async assertCanManageTeam(userId: string, teamId: string) {
    const membership = await this.prisma.v1TeamMembership.findFirst({
      where: {
        teamId,
        userId,
        status: 'active',
        role: { in: ['owner', 'manager'] },
        team: { status: 'active', deletedAt: null },
      },
      select: { id: true },
    });
    if (!membership) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: '팀장 또는 운영진만 컨택을 보낼 수 있어요.',
      });
    }
    return membership;
  }
}
