import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiConsumes, ApiBody, ApiOperation, ApiOkResponse, ApiCreatedResponse, ApiUnauthorizedResponse, ApiForbiddenResponse, ApiNotFoundResponse } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UploadsService } from './uploads.service';

const ALLOWED_MIMETYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

@ApiTags('uploads')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post()
  @ApiOperation({ summary: '파일 업로드 (최대 5개, 10MB, jpeg/png/webp/gif)' })
  @ApiConsumes('multipart/form-data')
  @ApiCreatedResponse({ description: 'Files uploaded successfully' })
  @ApiUnauthorizedResponse({ description: 'JWT token missing or invalid' })
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
  @UseInterceptors(
    FilesInterceptor('files', 5, {
      storage: memoryStorage(),
      limits: { fileSize: MAX_FILE_SIZE },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_MIMETYPES.includes(file.mimetype)) {
          return cb(
            new BadRequestException(
              `Unsupported file type: ${file.mimetype}`,
            ),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  async uploadFiles(
    @CurrentUser('id') userId: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.uploadsService.uploadFiles(userId, files);
  }

  /**
   * Policy decision (Phase 3C): upload metadata is accessible to any authenticated user.
   * The underlying files are served via public CDN/static URLs, so restricting metadata
   * to uploader-only would break team-logo / review-image display for other users.
   * If a stricter policy is needed in future, add uploader-only check in UploadsService.getUpload.
   */
  @Get(':id')
  @ApiOperation({ summary: '업로드 파일 메타데이터 조회' })
  @ApiOkResponse({ description: 'Upload metadata' })
  @ApiUnauthorizedResponse({ description: 'JWT token missing or invalid' })
  @ApiNotFoundResponse({ description: 'Upload not found' })
  async getUpload(@Param('id') id: string) {
    return this.uploadsService.getUpload(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: '업로드 파일 삭제 (업로더 본인만)' })
  @ApiOkResponse({ description: 'Upload deleted' })
  @ApiUnauthorizedResponse({ description: 'JWT token missing or invalid' })
  @ApiForbiddenResponse({ description: 'Caller is not the uploader' })
  @ApiNotFoundResponse({ description: 'Upload not found' })
  async deleteUpload(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.uploadsService.deleteUpload(id, userId);
  }
}
