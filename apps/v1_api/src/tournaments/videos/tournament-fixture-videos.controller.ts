import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/current-user.decorator';
import { V1AuthGuard } from '../../auth/v1-auth.guard';
import type { V1AuthUser } from '../../auth/v1-auth-user';
import { UploadsService } from '../../uploads/uploads.service';
// Side-effect import: augments global Express.Multer namespace
import '../../uploads/multer.types';
import { CreateFixtureVideoDto, UploadFixtureVideoDto } from './dto/fixture-video.dto';
import { TournamentFixtureVideosService } from './tournament-fixture-videos.service';

const UUID_PARAM = new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY });

/** 서비스의 정밀 200MB 검증 위에 두는 multer 하드 백스톱. */
const VIDEO_UPLOAD_HARD_CAP_BYTES = 220 * 1024 * 1024; // 220MB

/**
 * 대회 경기 영상 등록 — 외부 링크와 서버 업로드 파일을 모두 받는다.
 *
 * 권한 판정은 `TournamentFixtureVideosService` 안에서 `TournamentStaffAccessService` 로 한다
 * (필드 단위로 배정된 FIELD_OPERATOR 는 경기의 `fieldId` 까지 봐야 판정할 수 있어서 라우트
 * 파라미터만 보는 가드로는 부족하다 — 그 서비스의 doc comment 참고). 여기서는 인증만 세운다.
 */
@ApiTags('tournament-ops')
@Controller('tournament-ops/tournaments/:tournamentId')
@UseGuards(V1AuthGuard)
export class TournamentFixtureVideosController {
  constructor(private readonly videos: TournamentFixtureVideosService) {}

  @Get('videos')
  @ApiOperation({ summary: '대회 전체 경기 + 등록된 영상 목록 (운영 스태프)' })
  listTournamentVideos(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId', UUID_PARAM) tournamentId: string,
  ) {
    return this.videos.listTournamentVideos(user, tournamentId);
  }

  @Get('fixtures/:fixtureId/videos')
  @ApiOperation({ summary: '경기 영상 목록 (운영 스태프)' })
  listFixtureVideos(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId', UUID_PARAM) tournamentId: string,
    @Param('fixtureId', UUID_PARAM) fixtureId: string,
  ) {
    return this.videos.listFixtureVideos(user, tournamentId, fixtureId);
  }

  @Post('fixtures/:fixtureId/videos')
  @ApiOperation({ summary: '경기 영상 등록 — 외부 링크 또는 업로드한 파일 URL' })
  createVideo(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId', UUID_PARAM) tournamentId: string,
    @Param('fixtureId', UUID_PARAM) fixtureId: string,
    @Body() dto: CreateFixtureVideoDto,
  ) {
    return this.videos.createVideo(user, tournamentId, fixtureId, dto);
  }

  /**
   * 업로드와 등록을 한 요청에서 끝낸다. 업로드만 성공하고 등록이 실패하면 참조 없는 대용량
   * 파일이 남기 때문에, 파일을 받는 유일한 경로를 등록과 묶어 뒀다.
   */
  @Post('fixtures/:fixtureId/videos/upload')
  // 영상은 바이트 비용이 커서 연결당 3회/분으로 제한한다(기존 영상 업로드 경로와 동일).
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({ summary: '경기 영상 업로드 + 등록 (1개, 200MB, mp4/webm/mov)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: { type: 'array', items: { type: 'string', format: 'binary' } },
        title: { type: 'string' },
      },
    },
  })
  @UseInterceptors(
    FilesInterceptor('files', 1, {
      dest: UploadsService.UPLOAD_BASE,
      limits: { fileSize: VIDEO_UPLOAD_HARD_CAP_BYTES, files: 1 },
    }),
  )
  uploadVideo(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId', UUID_PARAM) tournamentId: string,
    @Param('fixtureId', UUID_PARAM) fixtureId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Body() dto: UploadFixtureVideoDto,
  ) {
    return this.videos.uploadAndCreateVideo(user, tournamentId, fixtureId, files ?? [], dto.title);
  }

  @Delete('fixtures/:fixtureId/videos/:videoId')
  @ApiOperation({ summary: '경기 영상 삭제 — 업로드 파일이면 물리 파일까지 회수' })
  deleteVideo(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId', UUID_PARAM) tournamentId: string,
    @Param('fixtureId', UUID_PARAM) fixtureId: string,
    @Param('videoId', UUID_PARAM) videoId: string,
  ) {
    return this.videos.deleteVideo(user, tournamentId, fixtureId, videoId);
  }
}
