import {
  Controller,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiCreatedResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { UploadsService } from './uploads.service';
// Side-effect import: augments global Express.Multer namespace
import './multer.types';

// Hard DoS backstop, above the precise 5MB limit enforced in UploadsService.
// Files between 5MB and this cap still get the clear "5MB 초과" 400 from the
// service; larger ones are rejected by multer before fully buffering to disk.
export const UPLOAD_HARD_CAP_BYTES = 10 * 1024 * 1024; // 10MB

/**
 * ## 영상 업로드는 여기 없다 (의도된 것 — 다시 추가하지 말 것)
 * `POST /uploads/videos` 는 로그인만 하면 누구나 호출할 수 있었고, 사용자당 하루 500MB·보관
 * 2GB 의 파일을 공개 정적 경로(`/uploads/*`)에 올릴 수 있었다. 그런데 그 파일을 제품에서
 * 소비하는 경로는 대회 경기 영상 하나뿐이고, 그 등록은 대회 스태프만 할 수 있다 — 즉 일반
 * 사용자에게 열려 있던 부분은 "아무도 참조하지 않는 파일을 올릴 수 있는 공개 파일 호스트"가
 * 전부였다. 그래서 영상 업로드는 스태프 권한 안에서 업로드와 등록을 한 번에 처리하는
 * `POST /tournament-ops/tournaments/:tournamentId/fixtures/:fixtureId/videos/upload`
 * (`TournamentFixtureVideosController`)로 옮겼다. 업로드 저장 자체는 그대로
 * `UploadsService.storeFiles(..., 'video')` 가 담당한다.
 */
@ApiTags('uploads')
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post()
  @UseGuards(V1AuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: '이미지 업로드 (최대 5개, 5MB, jpeg/png/webp)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @ApiCreatedResponse({
    description: '업로드 성공',
    schema: {
      // Reflects the global TransformInterceptor envelope ({ status, data, timestamp }).
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        data: {
          type: 'object',
          properties: {
            urls: { type: 'array', items: { type: 'string' } },
          },
        },
        timestamp: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: '인증이 필요해요.' })
  // UploadsService is the single content validator (mimetype + precise 5MB) so it
  // returns clear 400s and unlinks rejected temp files. A multer fileFilter would
  // silently drop bad files → empty array → misleading "파일을 선택해주세요" +
  // unreachable validation, so we don't use one. The multer fileSize limit below
  // is only a hard DoS backstop (above the 5MB service limit).
  @UseInterceptors(
    FilesInterceptor('files', 5, {
      dest: UploadsService.UPLOAD_BASE,
      limits: { fileSize: UPLOAD_HARD_CAP_BYTES, files: 5 },
    }),
  )
  async uploadFiles(
    @CurrentUser() user: V1AuthUser,
    @UploadedFiles() files: Express.Multer.File[],
  ): Promise<{ urls: string[] }> {
    // Return root-relative URLs (/uploads/...). The web app proxies /uploads to
    // this service (next.config rewrite), so images resolve in dev and prod
    // without depending on the request host.
    return this.uploadsService.storeFiles(files ?? [], user.id, '', 'image');
  }
}
