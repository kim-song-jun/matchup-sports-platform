import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { V1AuthUser } from '../auth/v1-auth-user';
import { NotificationsService, type NotificationEventType } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateContactBlockDto,
  CreateTeamContactDto,
  DeclineTeamContactDto,
  ListTeamContactsQueryDto,
  UpdateContactPolicyDto,
} from './dto/team-contact.dto';

/** 한 팀이 24시간 동안 보낼 수 있는 컨택 수. 확정값 — 스펙 §2. */
const DAILY_SEND_LIMIT = 10;
/** 일일 한도 초과 응답이 클라이언트에 알려주는 재시도 대기(초). 24시간 rolling window 기준. */
const RETRY_AFTER_SECONDS = 24 * 60 * 60;
/** 무응답 컨택이 만료되기까지의 일수. 확정값 — 스펙 §6. */
const EXPIRY_DAYS = 7;
/** 목록 조회 기본/최대 페이지 크기. */
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

// 공유 node_modules 의 생성된 Prisma 클라이언트가 origin/dev 의 schema.prisma 보다 오래됐다
// (V1TeamContact 관련 타입이 아예 없음 — 2026-08-20 실측, 이 worktree 한정 환경 제약).
// `@prisma/client` 에서 V1TeamContactStatus 를 import 하면 stale client 에 없어 깨지므로
// 로컬 union 타입으로 대체한다. `prisma generate` 는 모노레포 전체 공유 경로라 절대 금지.
type TeamContactStatus = 'requested' | 'accepted' | 'declined' | 'withdrawn' | 'expired';

// 이 레포는 공용 에러 헬퍼를 두지 않고 파일마다 로컬로 중복 정의한다
// (chat/matches/team-matches/teams 4개 서비스가 각각 같은 함수를 갖고 있다).
function stateConflict(message: string, code = 'STATE_CONFLICT', details?: unknown) {
  return new ConflictException({ code, message, details });
}

@Injectable()
export class TeamContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * team-matches.service.ts 의 emitNotificationToTeamManagers 와 같은 패턴이다.
   * emitToManyDeferred 는 수신자 해석을 지연시키고 에러를 삼키므로,
   * 알림 실패가 컨택 생성/수락 자체를 되돌리지 않는다.
   */
  private notifyTeamManagers(teamId: string, type: NotificationEventType, targetId: string) {
    this.notifications.emitToManyDeferred(
      async () => {
        const rows = await this.prisma.v1TeamMembership.findMany({
          where: { teamId, status: 'active', role: { in: ['owner', 'manager'] } },
          select: { userId: true },
        });
        return rows.map((row) => row.userId);
      },
      type,
      targetId,
      undefined,
    );
  }

  async create(user: V1AuthUser, toTeamId: string, dto: CreateTeamContactDto) {
    await this.assertCanManageTeam(user.id, dto.fromTeamId);

    if (dto.fromTeamId === toTeamId) {
      throw stateConflict('같은 팀에는 컨택을 보낼 수 없어요.', 'TEAM_CONTACT_SELF_NOT_ALLOWED');
    }

    // advisory lock 트랜잭션 **앞**에서 부른다 — 이 검사는 팀쌍 경합과 무관해서
    // 락 안에서 부르면 락 유지 시간만 늘어난다.
    await this.assertRecipientAccepting(dto.fromTeamId, toTeamId);

    const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const created = await this.prisma.$transaction(async (tx) => {
      // 락 키의 팀 id 를 정렬한다. A→B 와 B→A 가 같은 락을 잡아야 양방향 중복 검사가
      // 실제로 상호배제된다 — 정렬하지 않으면 두 방향이 서로 다른 락을 잡고 동시 통과한다.
      const [left, right] = [dto.fromTeamId, toTeamId].sort();
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`team-contact:${left}:${right}`}, 0))`;

      const now = new Date();
      const directionOr = [
        { fromTeamId: dto.fromTeamId, toTeamId },
        { fromTeamId: toTeamId, toTeamId: dto.fromTeamId },
      ];

      // 이 팀쌍의 만료된 대기 건을 먼저 정리한다. advisory lock 안이라 경합이 없다.
      // 이걸 안 하면 DB 는 requested 인데 화면은 expired 인 상태가 영구히 남아,
      // Phase 2·3 이나 어드민 쿼리가 status 를 곧이곧대로 읽었을 때 틀린 답을 얻는다.
      await tx.v1TeamContact.updateMany({
        where: { status: 'requested', expiresAt: { lt: now }, OR: directionOr },
        data: { status: 'expired' },
      });

      // 활성 = 수락된 것(만료 개념 없음) 또는 아직 만료 전인 대기 건.
      // 만료 시각이 지난 requested 는 화면에 expired 로 보이므로(그리고 위에서 이미 정리됐으므로)
      // 활성으로 치지 않는다 — 그래야 같은 팀쌍의 재발송이 영구히 막히지 않는다.
      const active = await tx.v1TeamContact.findFirst({
        where: {
          AND: [
            { OR: directionOr },
            { OR: [{ status: 'accepted' }, { status: 'requested', expiresAt: { gt: now } }] },
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
        // 레이트 리밋은 상태 충돌이 아니다 — 스펙 §8(a) 가 429 를 요구하고 프론트도 그렇게 가정한다.
        // 실제 Retry-After 헤더는 서비스에서 던지는 예외로는 붙일 수 없어 details 로 내려보낸다.
        throw new HttpException(
          {
            code: 'TEAM_CONTACT_DAILY_LIMIT_EXCEEDED',
            message: '오늘 보낼 수 있는 컨택을 모두 사용했어요. 내일 다시 시도해 주세요.',
            details: { retryAfterSeconds: RETRY_AFTER_SECONDS },
          },
          HttpStatus.TOO_MANY_REQUESTS,
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
    // 트랜잭션 밖에서 쏜다 — 트랜잭션 안에서 쏘면 이후 커밋 실패로 롤백돼도 알림은 이미 나간 뒤다.
    this.notifyTeamManagers(created.toTeamId, 'team_contact_received', created.id);
    return created;
  }

  async accept(user: V1AuthUser, contactId: string) {
    return this.respond(user, contactId, 'toTeamId', 'accepted');
  }

  async decline(user: V1AuthUser, contactId: string, dto: DeclineTeamContactDto) {
    return this.respond(user, contactId, 'toTeamId', 'declined', dto.reason ?? null);
  }

  async withdraw(user: V1AuthUser, contactId: string) {
    return this.respond(user, contactId, 'fromTeamId', 'withdrawn');
  }

  private async respond(
    user: V1AuthUser,
    contactId: string,
    actorSide: 'fromTeamId' | 'toTeamId',
    nextStatus: 'accepted' | 'declined' | 'withdrawn',
    declineReason: string | null = null,
  ) {
    const contact = await this.prisma.v1TeamContact.findUnique({ where: { id: contactId } });
    if (!contact) {
      throw new NotFoundException({ code: 'TEAM_CONTACT_NOT_FOUND', message: '컨택을 찾을 수 없어요.' });
    }
    await this.assertCanManageTeam(user.id, contact[actorSide]);

    const status = await this.settleExpiry(contact);

    // 멱등: 이미 목표 상태면 아무것도 쓰지 않고 그대로 돌려준다
    if (status === nextStatus) {
      return { contact, alreadyProcessed: true };
    }
    if (status !== 'requested') {
      throw stateConflict(
        '이미 처리된 컨택이에요.',
        'TEAM_CONTACT_STATE_CONFLICT',
        { currentStatus: status },
      );
    }

    const result = await this.prisma.v1TeamContact.updateMany({
      where: { id: contactId, status: 'requested' },
      data: {
        status: nextStatus,
        respondedByUserId: user.id,
        respondedAt: new Date(),
        declineReason,
      },
    });

    if (result.count === 0) {
      // 우리가 requested 를 읽은 뒤 누군가 먼저 처리했다.
      // 최신 상태를 다시 읽어 멱등(같은 결과)과 충돌(다른 결과)을 가른다.
      const current = await this.prisma.v1TeamContact.findUnique({ where: { id: contactId } });
      if (!current) {
        throw new NotFoundException({ code: 'TEAM_CONTACT_NOT_FOUND', message: '컨택을 찾을 수 없어요.' });
      }
      if (current.status === nextStatus) {
        return { contact: current, alreadyProcessed: true };
      }
      throw stateConflict('이미 처리된 컨택이에요.', 'TEAM_CONTACT_STATE_CONFLICT', {
        currentStatus: current.status,
      });
    }

    const updated = await this.prisma.v1TeamContact.findUniqueOrThrow({ where: { id: contactId } });
    if (nextStatus === 'accepted' || nextStatus === 'declined') {
      // 응답 결과는 '보낸 팀' 이 알아야 한다. 철회는 상대가 아직 안 봤으므로 알리지 않는다.
      this.notifyTeamManagers(
        contact.fromTeamId,
        nextStatus === 'accepted' ? 'team_contact_accepted' : 'team_contact_declined',
        contactId,
      );
    }
    return { contact: updated, alreadyProcessed: false };
  }

  /**
   * 만료를 읽기 시점에 반영한다. 이 레포에는 cron 인프라(@nestjs/schedule)가 없어
   * 배치로 돌릴 수 없다 — team-matches 의 getApiStatus() 와 같은 lazy-flip 방식이다.
   * 판정과 DB 정리를 한 곳에 모아, 목록 조회와 상태 전이가 서로 다른 답을 내지 않게 한다.
   */
  private async settleExpiry(contact: { id: string; status: string; expiresAt: Date }) {
    if (contact.status !== 'requested' || contact.expiresAt > new Date()) {
      return contact.status;
    }
    // status 를 where 에 넣어 동시에 수락된 건을 덮어쓰지 않게 한다
    await this.prisma.v1TeamContact.updateMany({
      where: { id: contact.id, status: 'requested', expiresAt: { lt: new Date() } },
      data: { status: 'expired' },
    });
    return 'expired';
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
        message: '팀장 또는 운영진만 할 수 있어요.',
      });
    }
    return membership;
  }

  /**
   * 받는 팀이 지금 컨택을 받는 상태인지 본다. 세 가지 거부 사유(차단 / closed /
   * recruiting_only 인데 모집 중 아님)를 **하나의 응답으로 통일**한다 — 응답이 갈리면
   * 발신자가 "우리가 차단당했구나" 를 역추론할 수 있다(스펙 §8(b)).
   */
  private async assertRecipientAccepting(fromTeamId: string, toTeamId: string) {
    const notAccepting = () =>
      new ForbiddenException({
        code: 'TEAM_CONTACT_NOT_ACCEPTING',
        message: '이 팀은 지금 컨택을 받지 않고 있어요.',
      });

    // 리뷰 라운드 1 (I1): 세 조회(차단 / 팀 정책 / host 모집 매치)를 **항상 병렬**로
    // 돌린다. 순차 실행이면 사유별 DB 왕복 횟수가 다르다 — 차단=1, closed=2,
    // recruiting_only=3. 응답 본문(코드·메시지)을 통일해도 발신자가 응답 지연시간으로
    // "우리가 차단당했구나"를 역추론할 수 있는 타이밍 부수 채널이 남는다(스펙 §8(b)).
    // 항상 3건을 동시에 조회하면 왕복 횟수가 사유와 무관하게 일정해지고, 최악 경로
    // (원래 3왕복이던 recruiting_only)는 오히려 빨라진다. 컨택 생성은 팀당 하루 10건
    // 한도라 추가 조회 비용은 무시할 수 있다. 판정 우선순위(차단 → 팀 실재 → closed →
    // recruiting_only)는 조회를 병렬화해도 그대로 유지한다 — 조회 시점과 판정 순서는 별개다.
    const [block, team, recruiting] = await Promise.all([
      // 양방향: 상대가 나를 차단했거나, 내가 상대를 차단했거나.
      this.prisma.v1TeamContactBlock.findFirst({
        where: {
          OR: [
            { teamId: toTeamId, blockedTeamId: fromTeamId },
            { teamId: fromTeamId, blockedTeamId: toTeamId },
          ],
        },
        select: { id: true },
      }),
      this.prisma.v1Team.findUnique({
        where: { id: toTeamId },
        select: { contactPolicy: true },
      }),
      // '모집 중' = 이 팀이 host 인 recruiting 팀매치가 하나라도 있음 (스펙 §2 확정 결정 5).
      // 캐시 컬럼을 두지 않는다 — 두면 공고 생성·마감 시 무효화 책임이 새로 생긴다.
      // policy 가 recruiting_only 가 아니어도 항상 조회한다(위 타이밍 노트 참고).
      this.prisma.v1TeamMatch.findFirst({
        where: { hostTeamId: toTeamId, status: 'recruiting' },
        select: { id: true },
      }),
    ]);

    if (block) throw notAccepting();
    if (!team) {
      throw new NotFoundException({ code: 'TEAM_NOT_FOUND', message: '팀을 찾을 수 없어요.' });
    }
    if (team.contactPolicy === 'closed') throw notAccepting();
    if (team.contactPolicy === 'recruiting_only' && !recruiting) throw notAccepting();
  }

  async createBlock(user: V1AuthUser, teamId: string, dto: CreateContactBlockDto) {
    await this.assertCanManageTeam(user.id, teamId);
    if (dto.blockedTeamId === teamId) {
      throw stateConflict('자기 팀은 차단할 수 없어요.', 'TEAM_CONTACT_SELF_BLOCK_NOT_ALLOWED');
    }
    // 리뷰 라운드 1 (I2): 없는 팀 id 를 차단 대상으로 보내면 create() 시점에 FK 위반
    // (P2003)으로 raw 500 이 났다. 팀 실재 여부는 공개 정보라 여기서 404 를 줘도 새는
    // 정보가 없다 — assertRecipientAccepting 이 쓰는 것과 같은 코드·문구를 재사용한다.
    const targetTeam = await this.prisma.v1Team.findUnique({
      where: { id: dto.blockedTeamId },
      select: { id: true },
    });
    if (!targetTeam) {
      throw new NotFoundException({ code: 'TEAM_NOT_FOUND', message: '팀을 찾을 수 없어요.' });
    }

    const existing = await this.prisma.v1TeamContactBlock.findFirst({
      where: { teamId, blockedTeamId: dto.blockedTeamId },
      select: { id: true },
    });
    if (existing) return { block: existing, alreadyBlocked: true };

    try {
      const block = await this.prisma.v1TeamContactBlock.create({
        data: {
          teamId,
          blockedTeamId: dto.blockedTeamId,
          createdByUserId: user.id,
          reason: dto.reason ?? null,
        },
      });
      return { block, alreadyBlocked: false };
    } catch (error) {
      // 리뷰 라운드 1 (C1): findFirst 로 사전 확인해도 findFirst 와 create() 사이에
      // 틈이 있다 — 동시 요청(더블클릭·재시도) 두 개가 그 틈을 지나가면 두 번째 create()
      // 가 @@unique([teamId, blockedTeamId]) 제약(P2002)에 걸린다. 이 저장소엔 전역
      // P2002 예외 필터가 없어(12곳 전부 서비스 로컬 try/catch) 잡지 않으면 raw 500 +
      // 영어 메시지가 나간다. 차단은 멱등이 자연스러운 결과이므로 던지지 않고 다시
      // 조회해 findFirst 경로와 완전히 같은 응답으로 수렴시킨다(패턴 출처:
      // teams.service.ts 의 changeMembershipJersey).
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const raced = await this.prisma.v1TeamContactBlock.findFirst({
          where: { teamId, blockedTeamId: dto.blockedTeamId },
          select: { id: true },
        });
        return { block: raced, alreadyBlocked: true };
      }
      throw error;
    }
  }

  async listBlocks(user: V1AuthUser, teamId: string) {
    await this.assertCanManageTeam(user.id, teamId);
    const items = await this.prisma.v1TeamContactBlock.findMany({
      where: { teamId },
      orderBy: { createdAt: 'desc' },
      include: { blockedTeam: { select: { id: true, name: true } } },
    });
    return { items };
  }

  async removeBlock(user: V1AuthUser, teamId: string, blockedTeamId: string) {
    await this.assertCanManageTeam(user.id, teamId);
    const result = await this.prisma.v1TeamContactBlock.deleteMany({ where: { teamId, blockedTeamId } });
    // 멱등: 이미 없으면 그냥 removed:false. 없는 차단을 지우는 건 오류가 아니다.
    return { removed: result.count > 0 };
  }

  async updateContactPolicy(user: V1AuthUser, teamId: string, dto: UpdateContactPolicyDto) {
    await this.assertCanManageTeam(user.id, teamId);
    const team = await this.prisma.v1Team.update({
      where: { id: teamId },
      data: { contactPolicy: dto.contactPolicy },
      select: { id: true, contactPolicy: true },
    });
    return team;
  }

  async listForTeam(user: V1AuthUser, teamId: string, query: ListTeamContactsQueryDto) {
    await this.assertCanManageTeam(user.id, teamId);
    const limit = Math.min(Math.max(query.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const directionWhere =
      query.direction === 'outbound' ? { fromTeamId: teamId } : { toTeamId: teamId };

    // 조회 **전에** 이 팀·방향의 만료된 대기 건을 정리한다. 이걸 안 하면 status 필터가 원시 DB 값을
    // 보기 때문에 `status=expired` 가 표시상 만료된 행(DB 는 아직 requested)을 통째로 놓친다.
    await this.prisma.v1TeamContact.updateMany({
      where: { ...directionWhere, status: 'requested', expiresAt: { lt: new Date() } },
      data: { status: 'expired' },
    });

    const rows = await this.prisma.v1TeamContact.findMany({
      where: {
        ...directionWhere,
        ...(query.status ? { status: query.status as TeamContactStatus } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    const pageItems = rows.slice(0, limit);
    const hasNext = rows.length > limit;
    return {
      items: pageItems.map((row) => this.toListItem(row)),
      pageInfo: { nextCursor: hasNext ? pageItems.at(-1)?.id ?? null : null, hasNext },
    };
  }

  async detail(user: V1AuthUser, contactId: string) {
    const contact = await this.prisma.v1TeamContact.findUnique({ where: { id: contactId } });
    if (!contact) {
      throw new NotFoundException({ code: 'TEAM_CONTACT_NOT_FOUND', message: '컨택을 찾을 수 없어요.' });
    }
    await this.assertParticipantSide(user.id, contact);
    // 단건 경로이므로 respond() 와 같은 lazy-flip 을 적용해 DB 상태까지 맞춘다.
    const status = await this.settleExpiry(contact);
    return this.toListItem({ ...contact, status });
  }

  /** 받는 팀 → 보낸 팀 순으로 본다. 어느 한쪽 운영진이면 통과. */
  private async assertParticipantSide(
    userId: string,
    contact: { fromTeamId: string; toTeamId: string },
  ) {
    for (const teamId of [contact.toTeamId, contact.fromTeamId]) {
      const membership = await this.prisma.v1TeamMembership.findFirst({
        where: {
          teamId, userId, status: 'active',
          role: { in: ['owner', 'manager'] },
          team: { status: 'active', deletedAt: null },
        },
        select: { id: true },
      });
      if (membership) return;
    }
    throw new ForbiddenException({
      code: 'PERMISSION_DENIED',
      message: '이 컨택을 볼 권한이 없어요.',
    });
  }

  /**
   * 만료를 표시에 반영하는 **계산 전용** 헬퍼다. 행마다 write 를 돌리지 않기 위해 여기서는
   * DB 를 건드리지 않는다. DB 정리는 호출 경로 쪽에서 한다 — create()(같은 팀쌍의 만료 대기 건
   * 사전 정리) / respond()(settleExpiry) / listForTeam()(조회 전 해당 팀·방향 일괄 정리) /
   * detail()(settleExpiry). 즉 네 경로 모두 읽는 시점에 DB 상태까지 맞춘다.
   */
  private toListItem(row: { id: string; status: string; expiresAt: Date; [k: string]: unknown }) {
    const expired = row.status === 'requested' && row.expiresAt <= new Date();
    return { ...row, status: expired ? 'expired' : row.status };
  }
}
