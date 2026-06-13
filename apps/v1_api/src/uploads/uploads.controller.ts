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

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIMETYPES = ['image/jpeg', 'image/png', 'image/webp'];

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
      type: 'object',
      properties: {
        urls: { type: 'array', items: { type: 'string' } },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: '인증이 필요해요.' })
  @UseInterceptors(
    FilesInterceptor('files', 5, {
      dest: UploadsService.UPLOAD_BASE,
      limits: { fileSize: MAX_FILE_SIZE, files: 5 },
      fileFilter: (
        _req: unknown,
        file: { mimetype: string },
        cb: (err: Error | null, acceptFile: boolean) => void,
      ) => {
        if (!ALLOWED_MIMETYPES.includes(file.mimetype)) {
          // Reject: multer will still write nothing for this file
          cb(null, false);
          return;
        }
        cb(null, true);
      },
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
