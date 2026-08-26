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
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { UploadsService } from '../uploads/uploads.service';
// Side-effect import: augments global Express.Multer namespace
import '../uploads/multer.types';
import { CreateFixtureVideoDto, UploadFixtureVideoDto } from '../tournaments/videos/dto/fixture-video.dto';
import { LeagueFixtureVideosService } from './league-fixture-videos.service';

const UUID_PARAM = new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY });

/** 대회 영상 컨트롤러와 동일한 multer 하드 백스톱(서비스의 정밀 200MB 검증 위). */
const VIDEO_UPLOAD_HARD_CAP_BYTES = 220 * 1024 * 1024; // 220MB

/**
 * 리그 대진 경기 영상 등록 — 대회 영상 컨트롤러(tournament-fixture-videos.controller.ts)의
 * 팀매치 판. 권한(플랫폼 운영자)은 서비스의 `AdminContextService.getMutationAdmin` 이
 * 판정한다 — 다른 `admin/league-matches` 라우트들과 같은 축이라 여기서는 인증만 세운다.
 */
@ApiTags('league-matches')
@Controller('admin/league-matches/:leagueId')
@UseGuards(V1AuthGuard)
export class LeagueFixtureVideosController {
  constructor(private readonly videos: LeagueFixtureVideosService) {}

  @Get('videos')
  @ApiOperation({ summary: '리그 전체 대진 + 등록된 영상 목록 (운영자)' })
  listLeagueVideos(@CurrentUser() user: V1AuthUser, @Param('leagueId', UUID_PARAM) leagueId: string) {
    return this.videos.listLeagueVideos(user, leagueId);
  }

  @Post('fixtures/:teamMatchId/videos')
  @ApiOperation({ summary: '리그 경기 영상 등록 — 외부 링크 또는 업로드한 파일 URL' })
  createVideo(
    @CurrentUser() user: V1AuthUser,
    @Param('leagueId', UUID_PARAM) leagueId: string,
    @Param('teamMatchId', UUID_PARAM) teamMatchId: string,
    @Body() dto: CreateFixtureVideoDto,
  ) {
    return this.videos.createVideo(user, leagueId, teamMatchId, dto);
  }

  /** 업로드와 등록을 한 요청에서 — 대회 쪽과 같은 이유(참조 없는 대용량 파일 방지). */
  @Post('fixtures/:teamMatchId/videos/upload')
  // 영상은 바이트 비용이 커서 연결당 3회/분으로 제한한다(대회 영상 업로드 경로와 동일).
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({ summary: '리그 경기 영상 업로드 + 등록 (1개, 200MB, mp4/webm/mov)' })
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
    @Param('leagueId', UUID_PARAM) leagueId: string,
    @Param('teamMatchId', UUID_PARAM) teamMatchId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Body() dto: UploadFixtureVideoDto,
  ) {
    return this.videos.uploadAndCreateVideo(user, leagueId, teamMatchId, files ?? [], dto.title);
  }

  @Delete('fixtures/:teamMatchId/videos/:videoId')
  @ApiOperation({ summary: '리그 경기 영상 삭제 — 업로드 파일이면 물리 파일까지 회수' })
  deleteVideo(
    @CurrentUser() user: V1AuthUser,
    @Param('leagueId', UUID_PARAM) leagueId: string,
    @Param('teamMatchId', UUID_PARAM) teamMatchId: string,
    @Param('videoId', UUID_PARAM) videoId: string,
  ) {
    return this.videos.deleteVideo(user, leagueId, teamMatchId, videoId);
  }
}
