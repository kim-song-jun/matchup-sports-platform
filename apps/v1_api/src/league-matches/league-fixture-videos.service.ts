import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, V1TeamMatchVideo } from '@prisma/client';
import { AdminContextService } from '../common/admin-context.service';
import { PrismaService } from '../prisma/prisma.service';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { UploadsService, type UploadedFile } from '../uploads/uploads.service';
import {
  fixtureVideoUrlRejectionMessage,
  parseFixtureVideoUrl,
} from '../tournaments/videos/fixture-video-url';
import { MAX_VIDEOS_PER_FIXTURE } from '../tournaments/videos/tournament-fixture-videos.service';
import type { CreateFixtureVideoDto } from '../tournaments/videos/dto/fixture-video.dto';
import { findTournamentOnSurface } from '../tournaments/tournament-surface-lookup';
import { enqueueUploadedVideoCleanup, enqueueUploadedVideoCleanupInTx, lockVideoUrl } from '../games/video-url-lock';

/**
 * 리그 대진(팀매치) 경기 영상 등록·삭제.
 *
 * URL 검증(`parseFixtureVideoUrl`)·경기당 상한(`MAX_VIDEOS_PER_FIXTURE`)·업로드 원장
 * 소유 확인·파일 회수 규칙을 대회 쪽(`tournament-fixture-videos.service.ts`)과 그대로
 * 공유한다 — 같은 "경기 영상" 개념이 도메인마다 다른 규칙을 가지면 화면·운영이 갈린다.
 *
 * 권한은 대회의 스태프 스코프와 달리 **플랫폼 운영자 게이트**다 — 등록·삭제(mutation)는
 * `AdminContextService.getMutationAdmin`(support 등급 차단, 리그 운영은 전부 운영자
 * 입력으로 확정된 정책(2026-08-24)과 같은 축), 조회(`listLeagueVideos`)는 대회 쪽
 * (`tournament-fixture-videos.service.ts`)과 맞춰 `getActiveAdmin`으로 support 등급도
 * 통과시킨다 — mutation 정책은 '입력'에 관한 것이지 '조회'를 막을 근거가 아니다.
 */
@Injectable()
export class LeagueFixtureVideosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminContext: AdminContextService,
    private readonly uploads: UploadsService,
  ) {}

  private async resolveFixture(leagueId: string, teamMatchId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    const fixture = await client.v1TeamMatch.findFirst({
      where: { id: teamMatchId, leagueId, deletedAt: null },
      select: { id: true },
    });
    if (fixture === null) {
      throw new NotFoundException({ code: 'LEAGUE_FIXTURE_NOT_FOUND', message: '경기를 찾을 수 없어요.' });
    }
    return fixture;
  }

  /** 리그 전체 대진 + 등록된 영상 — 어드민 영상 관리 화면용. 응답 모양은
   * `listTournamentVideos` 와 동일하게 맞춘다(화면 데이터 레이어 공유). */
  async listLeagueVideos(user: V1AuthUser, leagueId: string) {
    // 조회 전용 — support 등급도 통과해야 한다. 등록·삭제(mutation)만 getMutationAdmin.
    await this.adminContext.getActiveAdmin(user.id);
    const league = await findTournamentOnSurface(this.prisma, ['regular_league'], {
      where: { id: leagueId, deletedAt: null },
      select: { id: true },
    });
    if (league === null) {
      throw new NotFoundException({ code: 'LEAGUE_NOT_FOUND', message: '리그를 찾을 수 없어요.' });
    }

    const fixtures = await this.prisma.v1TeamMatch.findMany({
      where: { leagueId, deletedAt: null },
      select: {
        id: true,
        startAt: true,
        status: true,
        hostTeam: { select: { name: true } },
        approvedApplicantTeam: { select: { name: true } },
        videos: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
      },
      orderBy: [{ startAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    const validFixtures = fixtures.map((fixture) => {
      const startAt = fixture.startAt;
      const hostTeam = fixture.hostTeam;
      if (startAt === null || hostTeam === null) {
        throw new ConflictException({ code: 'LEAGUE_FIXTURE_INCOMPLETE', message: '리그 대진의 일정 또는 홈 팀 정보가 없어 영상을 표시할 수 없어요.' });
      }
      return { ...fixture, startAt, hostTeam };
    });

    // 주차 라벨 — 공개 기록(getLeagueFixtureRecord)의 resolveLeagueWeekNumber 와 같은
    // KST 경기일 파생 규칙. 같은 경기가 화면마다 다른 주차로 불리면 안 된다.
    const days = Array.from(new Set(validFixtures.map((fixture) => KST_DAY.format(fixture.startAt)))).sort();

    return {
      items: validFixtures.map((fixture) => {
        const weekIndex = days.indexOf(KST_DAY.format(fixture.startAt));
        return {
          fixtureId: fixture.id,
          round: `${weekIndex >= 0 ? weekIndex + 1 : 1}주차`,
          fixtureNumber: 1,
          legNumber: 1,
          scheduledAt: fixture.startAt.toISOString(),
          status: fixture.status,
          homeTeamName: fixture.hostTeam.name,
          awayTeamName: fixture.approvedApplicantTeam?.name ?? null,
          videos: fixture.videos.map((video) => this.serialize(video)),
        };
      }),
    };
  }

  /** 외부 링크 또는 이미 업로드된 파일 URL 을 등록한다. */
  async createVideo(user: V1AuthUser, leagueId: string, teamMatchId: string, dto: CreateFixtureVideoDto) {
    await this.adminContext.getMutationAdmin(user.id);
    await this.resolveFixture(leagueId, teamMatchId);

    const parsed = parseFixtureVideoUrl(dto.url);
    if (!parsed.ok) {
      throw new BadRequestException({
        code: 'FIXTURE_VIDEO_URL_INVALID',
        message: fixtureVideoUrlRejectionMessage(parsed.reason),
        details: { reason: parsed.reason },
      });
    }
    if (parsed.source === 'upload') {
      await this.assertOwnUploadedVideo(user.id, parsed.url);
    }
    return this.insert(leagueId, teamMatchId, parsed.url, dto.title, user.id);
  }

  /** multipart 업로드 + 등록을 한 요청에서 — 대회 쪽과 같은 이유(참조 없는 대용량 파일 방지). */
  async uploadAndCreateVideo(
    user: V1AuthUser,
    leagueId: string,
    teamMatchId: string,
    files: UploadedFile[],
    title: string | undefined,
  ) {
    try {
      await this.adminContext.getMutationAdmin(user.id);
      await this.resolveFixture(leagueId, teamMatchId);
    } catch (error) {
      // multer 는 가드·서비스보다 먼저 파일을 임시 경로에 받아 둔다 — 권한/대상이 없으면
      // 그 임시 파일을 우리가 직접 지워야 한다(대회 쪽과 동일).
      await this.uploads.discardTemps(files);
      throw error;
    }

    const { urls } = await this.uploads.storeFiles(files, user.id, '', 'video');
    const url = urls[0];
    if (url === undefined) {
      throw new BadRequestException({ code: 'UPLOAD_FILE_REQUIRED', message: '업로드할 영상 파일을 선택해주세요.' });
    }
    try {
      return await this.insert(leagueId, teamMatchId, url, title, user.id);
    } catch (error) {
      await enqueueUploadedVideoCleanup(this.prisma, url);
      throw error;
    }
  }

  private async insert(leagueId: string, teamMatchId: string, url: string, title: string | undefined, ownerUserId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertMutationAdminInTx(tx, ownerUserId);
      await this.resolveFixture(leagueId, teamMatchId, tx);
      await lockVideoUrl(tx, url);
      const parsedUrl = parseFixtureVideoUrl(url);
      if (parsedUrl.ok && parsedUrl.source === 'upload') {
        const asset = await tx.v1UploadAsset.findUnique({ where: { url }, select: { ownerUserId: true, kind: true } });
        if (asset === null || asset.ownerUserId !== ownerUserId || asset.kind !== 'video') {
          throw new BadRequestException({ code: 'FIXTURE_VIDEO_UPLOAD_NOT_FOUND', message: '업로드한 영상 파일을 찾을 수 없어요. 파일을 다시 업로드해 주세요.' });
        }
      }
      const existing = await tx.v1TeamMatchVideo.findMany({
        where: { teamMatchId },
        select: { url: true, sortOrder: true },
      });
      if (existing.length >= MAX_VIDEOS_PER_FIXTURE) {
        throw new ConflictException({
          code: 'FIXTURE_VIDEO_LIMIT_EXCEEDED',
          message: `경기당 영상은 최대 ${MAX_VIDEOS_PER_FIXTURE}개까지 등록할 수 있어요.`,
        });
      }
      if (existing.some((video) => video.url === url)) {
        throw new ConflictException({ code: 'FIXTURE_VIDEO_DUPLICATE', message: '이미 등록된 영상이에요.' });
      }
      const sortOrder = existing.reduce((max, video) => Math.max(max, video.sortOrder), -1) + 1;
      const trimmedTitle = title?.trim();
      const row = await tx.v1TeamMatchVideo.create({
        data: {
          teamMatchId,
          url,
          title: trimmedTitle !== undefined && trimmedTitle.length > 0 ? trimmedTitle : null,
          sortOrder,
        },
      });
      return this.serialize(row);
    });
  }

  /** 업로드 URL 은 "내가 올린 영상"만 — 대회 쪽 `assertOwnUploadedVideo` 와 동일 규칙. */
  private async assertOwnUploadedVideo(userId: string, url: string) {
    const asset = await this.prisma.v1UploadAsset.findUnique({
      where: { url },
      select: { ownerUserId: true, kind: true },
    });
    if (asset === null || asset.kind !== 'video' || asset.ownerUserId !== userId) {
      throw new BadRequestException({
        code: 'FIXTURE_VIDEO_UPLOAD_NOT_FOUND',
        message: '업로드한 영상 파일을 찾을 수 없어요. 파일을 다시 업로드해 주세요.',
      });
    }
  }

  async deleteVideo(user: V1AuthUser, leagueId: string, teamMatchId: string, videoId: string) {
    await this.adminContext.getMutationAdmin(user.id);
    await this.prisma.$transaction(async (tx) => {
      await this.assertMutationAdminInTx(tx, user.id);
      await this.resolveFixture(leagueId, teamMatchId, tx);
      const video = await tx.v1TeamMatchVideo.findFirst({
        where: { id: videoId, teamMatchId },
        select: { id: true, url: true },
      });
      if (video === null) {
        throw new NotFoundException({ code: 'FIXTURE_VIDEO_NOT_FOUND', message: '등록된 영상을 찾을 수 없어요.' });
      }
      await lockVideoUrl(tx, video.url);
      await tx.v1TeamMatchVideo.delete({ where: { id: video.id } });
      await enqueueUploadedVideoCleanupInTx(tx, video.url);
    });
    return { deleted: true };
  }

  /** 업로드 파일 회수는 canonical 팀매치 영상 전체의 URL 참조를 확인한다. */
  private async assertMutationAdminInTx(tx: Prisma.TransactionClient, userId: string): Promise<void> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT admin_user.id
      FROM v1_admin_users admin_user
      INNER JOIN v1_users user_account ON user_account.id = admin_user.user_id
      WHERE admin_user.user_id = ${userId}
        AND admin_user.admin_role IN ('owner', 'ops')
        AND admin_user.status = 'active'
        AND admin_user.revoked_at IS NULL
        AND user_account.account_status = 'active'
      FOR SHARE OF admin_user, user_account
      LIMIT 1
    `;
    if (rows.length === 0) {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: 'Active mutation admin access is required' });
    }
  }

  private serialize(row: V1TeamMatchVideo) {
    const parsed = parseFixtureVideoUrl(row.url);
    return {
      id: row.id,
      title: row.title,
      url: row.url,
      sortOrder: row.sortOrder,
      source: parsed.ok ? parsed.source : ('external' as const),
      createdAt: row.createdAt.toISOString(),
    };
  }
}

const KST_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' });
