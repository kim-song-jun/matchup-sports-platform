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
const UPLOAD_HARD_CAP_BYTES = 10 * 1024 * 1024; // 10MB
// 영상 전용 하드 캡 — 서비스의 정밀 200MB 검증 위에 두는 multer 백스톱
const VIDEO_UPLOAD_HARD_CAP_BYTES = 220 * 1024 * 1024; // 220MB

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

  @Post('videos')
  @UseGuards(V1AuthGuard)
  // R05-001: video uploads are expensive in bytes; limit to 3/min per connection.
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({ summary: '경기 영상 업로드 (1개, 200MB, mp4/webm/mov)' })
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
  @ApiCreatedResponse({ description: '업로드 성공 — { urls: string[] }' })
  @ApiUnauthorizedResponse({ description: '인증이 필요해요.' })
  @UseInterceptors(
    FilesInterceptor('files', 1, {
      dest: UploadsService.UPLOAD_BASE,
      limits: { fileSize: VIDEO_UPLOAD_HARD_CAP_BYTES, files: 1 },
    }),
  )
  async uploadVideo(
    @CurrentUser() user: V1AuthUser,
    @UploadedFiles() files: Express.Multer.File[],
  ): Promise<{ urls: string[] }> {
    // 정적 서빙(express.static)이 Range 요청을 지원하므로 /uploads/* URL 그대로
    // <video> 태그에서 시킹·스트리밍이 동작한다.
    return this.uploadsService.storeFiles(files ?? [], user.id, '', 'video');
  }
}
