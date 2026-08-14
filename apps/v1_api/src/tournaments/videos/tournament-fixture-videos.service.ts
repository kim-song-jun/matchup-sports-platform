import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { V1TournamentFixtureVideo } from '@prisma/client';
import type { V1AuthUser } from '../../auth/v1-auth-user';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadsService, type UploadedFile } from '../../uploads/uploads.service';
import {
  TournamentStaffAccessService,
  type TournamentStaffResource,
} from '../staff/tournament-staff-access.service';
import type { TournamentStaffAction } from '../staff/tournament-staff-policy';
import type { CreateFixtureVideoDto } from './dto/fixture-video.dto';
import { fixtureVideoUrlRejectionMessage, parseFixtureVideoUrl } from './fixture-video-url';

/** 경기당 등록 가능한 영상 수 — 재생 UI 의 플레이리스트가 다룰 수 있는 현실적인 상한. */
export const MAX_VIDEOS_PER_FIXTURE = 10;

type FixtureLookup = { readonly id: string; readonly fieldId: string | null };

/**
 * 대회 경기 영상 등록·삭제.
 *
 * ## 권한
 * 새 권한 개념을 만들지 않고 Task 7 의 `TournamentStaffAccessService` 를 그대로 쓴다.
 * - 조회는 `read`, 등록·삭제는 `event_append` 액션에 매핑한다. 영상 등록은 경기 기록에
 *   자료를 덧붙이는 행위이고, `field_operator` 가 담당 경기에 대해 가진 유일한 "기록 추가"
 *   권한이 `event_append` 다(`tournament-staff-policy.ts` 의 `allowsRoleAction`). 즉 이 매핑
 *   하나로 요구 사항(대회 디렉터·플랫폼 운영자는 전부, 필드 담당자는 담당 경기만)이 그대로
 *   성립한다. `support_readonly` 는 `read` 만 가지므로 등록·삭제에서 403 이 된다.
 * - 권한 판정은 컨트롤러의 가드가 아니라 이 서비스에서 한다. 가드는 라우트 파라미터
 *   (`tournamentId`/`fixtureId`)만 볼 수 있는데, 필드 단위로 배정된 `field_operator` 는
 *   경기의 `fieldId` 까지 있어야 통과할 수 있기 때문이다 —
 *   `TournamentFixtureLineupService` 가 같은 이유로 같은 방식을 쓴다.
 * - 존재 여부는 반드시 권한 판정 뒤에 본다. 순서를 뒤집으면 권한 없는 사람이 404/403 차이로
 *   어떤 경기 id 가 실재하는지 알아낼 수 있다(존재 오라클).
 *
 * ## 업로드 파일 정리 책임
 * 업로드 영상은 CDN·트랜스코딩 없이 로컬 디스크에서 그대로 서빙되므로, 정리하지 않으면
 * 디스크와 업로더의 보관 쿼터(`V1UploadAsset` 합계)가 계속 찬다. 이 서비스가 그 책임을 진다:
 * - 등록 실패 시 방금 저장한 파일을 되돌린다(`uploadAndCreate`).
 * - 영상 행을 지울 때 같은 URL 을 참조하는 행이 하나도 남지 않으면 파일과 업로드 원장
 *   (`V1UploadAsset`)을 함께 지운다(`releaseUploadedFile`).
 * - 외부 링크에는 정리할 파일이 없다.
 * 경기(`V1TournamentFixture`)가 통째로 삭제되면 영상 행은 DB cascade 로 사라지지만 파일은
 * 남는다 — 그 경로는 이 서비스를 지나지 않기 때문이다. 경기 삭제는 "결과가 기록되지 않은
 * 경기"에서만 허용되므로(`tournament-bracket.service.ts` 의 `deleteFixture`) 영상이 붙어 있는
 * 경우가 사실상 없고, 있더라도 파일은 업로더 쿼터 안에 남아 추적 가능하다. 이 잔여 경로까지
 * 자동으로 회수하려면 삭제 훅이 아니라 주기적 스윕(참조 없는 `V1UploadAsset` 정리)이 필요하고,
 * 그건 이 변경의 범위가 아니다 — 여기 적어 두는 이유는 정리 책임의 경계를 코드에 남기기
 * 위해서다.
 */
@Injectable()
export class TournamentFixtureVideosService {
  private readonly logger = new Logger(TournamentFixtureVideosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TournamentStaffAccessService,
    private readonly uploads: UploadsService,
  ) {}

  // ── 권한 ────────────────────────────────────────────────────────────────
  private async authorizeFixture(
    userId: string,
    tournamentId: string,
    fixtureId: string,
    action: TournamentStaffAction,
  ): Promise<FixtureLookup> {
    const fixture: FixtureLookup | null = await this.prisma.v1TournamentFixture.findUnique({
      where: { tournamentId_id: { tournamentId, id: fixtureId } },
      select: { id: true, fieldId: true },
    });

    const resource: TournamentStaffResource =
      fixture?.fieldId != null
        ? { tournamentId, fixtureId, fieldId: fixture.fieldId }
        : { tournamentId, fixtureId };
    await this.access.assertAccess({ userId, action, resource });

    if (fixture === null) {
      throw new NotFoundException({
        code: 'TOURNAMENT_FIXTURE_NOT_FOUND',
        message: '경기를 찾을 수 없어요.',
      });
    }
    return fixture;
  }

  // ── 조회 ────────────────────────────────────────────────────────────────
  /** 대회 전체 경기 + 등록된 영상 — 운영 콘솔의 영상 관리 화면용. */
  async listTournamentVideos(user: V1AuthUser, tournamentId: string) {
    await this.access.assertAccess({ userId: user.id, action: 'read', resource: { tournamentId } });
    const tournament = await this.prisma.v1Tournament.findFirst({
      where: { id: tournamentId, deletedAt: null },
      select: { id: true },
    });
    if (!tournament) {
      throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: '대회를 찾을 수 없어요.' });
    }

    const fixtures = await this.prisma.v1TournamentFixture.findMany({
      where: { tournamentId },
      select: {
        id: true,
        round: true,
        fixtureNumber: true,
        legNumber: true,
        scheduledAt: true,
        status: true,
        homeRegistration: { select: { team: { select: { name: true } } } },
        awayRegistration: { select: { team: { select: { name: true } } } },
        videos: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
      },
      orderBy: [{ round: 'asc' }, { fixtureNumber: 'asc' }, { legNumber: 'asc' }],
    });

    return {
      items: fixtures.map((fixture) => ({
        fixtureId: fixture.id,
        round: fixture.round,
        fixtureNumber: fixture.fixtureNumber,
        legNumber: fixture.legNumber,
        scheduledAt: fixture.scheduledAt?.toISOString() ?? null,
        status: fixture.status,
        homeTeamName: fixture.homeRegistration?.team.name ?? null,
        awayTeamName: fixture.awayRegistration?.team.name ?? null,
        videos: fixture.videos.map((video) => this.serialize(video)),
      })),
    };
  }

  /** 경기 하나의 영상 목록. */
  async listFixtureVideos(user: V1AuthUser, tournamentId: string, fixtureId: string) {
    await this.authorizeFixture(user.id, tournamentId, fixtureId, 'read');
    const videos = await this.prisma.v1TournamentFixtureVideo.findMany({
      where: { fixtureId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return { items: videos.map((video) => this.serialize(video)) };
  }

  // ── 등록 ────────────────────────────────────────────────────────────────
  /** 외부 링크 또는 이미 업로드된 파일 URL 을 등록한다. */
  async createVideo(
    user: V1AuthUser,
    tournamentId: string,
    fixtureId: string,
    dto: CreateFixtureVideoDto,
  ) {
    await this.authorizeFixture(user.id, tournamentId, fixtureId, 'event_append');

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
    return this.insert(fixtureId, parsed.url, dto.title);
  }

  /**
   * multipart 업로드 + 등록을 한 요청에서 끝낸다. 업로드만 성공하고 등록이 실패하는 창을
   * 없애기 위해서다 — 그 창이 열려 있으면 실패할 때마다 참조 없는 200MB 파일이 남는다.
   */
  async uploadAndCreateVideo(
    user: V1AuthUser,
    tournamentId: string,
    fixtureId: string,
    files: UploadedFile[],
    title: string | undefined,
  ) {
    try {
      await this.authorizeFixture(user.id, tournamentId, fixtureId, 'event_append');
    } catch (error) {
      // multer 는 가드·서비스보다 먼저 파일을 임시 경로에 받아 둔다. 권한이 없어 여기서
      // 끊기면 그 임시 파일을 우리가 직접 지워야 한다.
      await this.uploads.discardTemps(files);
      throw error;
    }

    const { urls } = await this.uploads.storeFiles(files, user.id, '', 'video');
    const url = urls[0];
    if (url === undefined) {
      throw new BadRequestException({
        code: 'UPLOAD_FILE_REQUIRED',
        message: '업로드할 영상 파일을 선택해주세요.',
      });
    }
    try {
      return await this.insert(fixtureId, url, title);
    } catch (error) {
      // 등록이 막히면(개수 상한·중복 등) 방금 저장한 파일은 아무도 참조하지 않는다.
      await this.releaseUploadedFile(url);
      throw error;
    }
  }

  private async insert(fixtureId: string, url: string, title: string | undefined) {
    const existing = await this.prisma.v1TournamentFixtureVideo.findMany({
      where: { fixtureId },
      select: { url: true, sortOrder: true },
    });
    if (existing.length >= MAX_VIDEOS_PER_FIXTURE) {
      throw new ConflictException({
        code: 'FIXTURE_VIDEO_LIMIT_EXCEEDED',
        message: `경기당 영상은 최대 ${MAX_VIDEOS_PER_FIXTURE}개까지 등록할 수 있어요.`,
      });
    }
    if (existing.some((video) => video.url === url)) {
      throw new ConflictException({
        code: 'FIXTURE_VIDEO_DUPLICATE',
        message: '이미 등록된 영상이에요.',
      });
    }
    const sortOrder = existing.reduce((max, video) => Math.max(max, video.sortOrder), -1) + 1;
    const trimmedTitle = title?.trim();
    const row = await this.prisma.v1TournamentFixtureVideo.create({
      data: {
        fixtureId,
        url,
        title: trimmedTitle !== undefined && trimmedTitle.length > 0 ? trimmedTitle : null,
        sortOrder,
      },
    });
    return this.serialize(row);
  }

  /**
   * 업로드 URL 은 "내가 방금 올린 영상"만 등록할 수 있다. 업로드 원장(`V1UploadAsset`)에서
   * 소유자와 종류를 확인한다 — 남이 올린 파일 URL 을 알아내 임의의 경기에 붙이는 경로를
   * 막고, 등록된 영상이 언제나 추적 가능한 업로드 자산과 1:1로 대응하게 한다.
   */
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

  // ── 삭제 ────────────────────────────────────────────────────────────────
  async deleteVideo(user: V1AuthUser, tournamentId: string, fixtureId: string, videoId: string) {
    await this.authorizeFixture(user.id, tournamentId, fixtureId, 'event_append');
    const video = await this.prisma.v1TournamentFixtureVideo.findFirst({
      where: { id: videoId, fixtureId },
      select: { id: true, url: true },
    });
    if (video === null) {
      throw new NotFoundException({
        code: 'FIXTURE_VIDEO_NOT_FOUND',
        message: '등록된 영상을 찾을 수 없어요.',
      });
    }
    await this.prisma.v1TournamentFixtureVideo.delete({ where: { id: video.id } });
    await this.releaseUploadedFile(video.url);
    return { deleted: true };
  }

  /**
   * 업로드 파일 회수. 같은 URL 을 참조하는 영상 행이 하나도 남지 않았을 때만 물리 파일과
   * 업로드 원장 행을 지운다 — 같은 파일을 다른 경기에도 등록해 둔 경우 남은 쪽의 재생이
   * 깨지면 안 되기 때문이다. 외부 링크는 지울 파일이 없어 그대로 통과한다.
   */
  private async releaseUploadedFile(url: string) {
    const parsed = parseFixtureVideoUrl(url);
    if (!parsed.ok || parsed.source !== 'upload') return;

    const stillReferenced = await this.prisma.v1TournamentFixtureVideo.count({ where: { url } });
    if (stillReferenced > 0) return;

    try {
      // 파일 → 원장 순서. 반대로 하면 파일 삭제가 실패했을 때 "원장에도 없고 디스크에는 남은"
      // 완전 고아가 되어 추적할 방법이 사라진다.
      await this.uploads.removeStoredUrl(url);
      await this.prisma.v1UploadAsset.deleteMany({ where: { url } });
    } catch (error) {
      // 파일 삭제 실패가 영상 삭제 자체를 되돌리지는 않는다(파일이 남아도 참조는 이미 없다).
      // 대신 경로를 남겨 운영에서 회수할 수 있게 한다.
      this.logger.error(
        `경기 영상 파일 정리 실패 — 수동 회수 필요 (${url}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private serialize(row: V1TournamentFixtureVideo) {
    const parsed = parseFixtureVideoUrl(row.url);
    return {
      id: row.id,
      title: row.title,
      url: row.url,
      sortOrder: row.sortOrder,
      /** 화면이 "업로드한 파일"과 "외부 링크"를 구분해 보여줄 수 있게 출처를 함께 준다. */
      source: parsed.ok ? parsed.source : ('external' as const),
      createdAt: row.createdAt.toISOString(),
    };
  }
}
