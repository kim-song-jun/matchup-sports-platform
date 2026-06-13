import {
  Controller,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiCreatedResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { UploadsService } from './uploads.service';
// Side-effect import: augments global Express.Multer namespace
import './multer.types';

// Hard DoS backstop, above the precise 5MB limit enforced in UploadsService.
// Files between 5MB and this cap still get the clear "5MB 초과" 400 from the
// service; larger ones are rejected by multer before fully buffering to disk.
const UPLOAD_HARD_CAP_BYTES = 10 * 1024 * 1024; // 10MB

@ApiTags('uploads')
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post()
  @UseGuards(V1AuthGuard)
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
    @UploadedFiles() files: Express.Multer.File[],
  ): Promise<{ urls: string[] }> {
    // Return root-relative URLs (/uploads/...). The web app proxies /uploads to
    // this service (next.config rewrite), so images resolve in dev and prod
    // without depending on the request host.
    return this.uploadsService.storeFiles(files ?? []);
  }
}
