import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import { MercenaryApplicationStatus } from '@prisma/client';
import { MercenaryService } from './mercenary.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { CreateMercenaryPostDto } from './dto/create-mercenary-post.dto';
import { UpdateMercenaryPostDto } from './dto/update-mercenary-post.dto';
import { ApplyMercenaryDto } from './dto/apply-mercenary.dto';
import { MercenaryQueryDto } from './dto/mercenary-query.dto';

@ApiTags('mercenary')
@Controller('mercenary')
export class MercenaryController {
  constructor(private readonly mercenaryService: MercenaryService) {}

  @Get()
  @ApiOperation({ summary: '용병 모집글 목록 (커서 페이지네이션)' })
  @ApiOkResponse({ description: '용병 모집글 목록 반환' })
  async findAll(@Query() query: MercenaryQueryDto) {
    return this.mercenaryService.findAll(query);
  }

  @Get('me/applications')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '내 용병 신청 목록' })
  @ApiOkResponse({ description: '내 용병 신청 목록 반환' })
  @ApiUnauthorizedResponse({ description: 'JWT required' })
  async findMyApplications(
    @CurrentUser('id') userId: string,
    @Query('status') status?: MercenaryApplicationStatus,
  ) {
    return this.mercenaryService.findMyApplications(userId, status);
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: '용병 모집글 상세 (비인증 시 신청자 PII 제거)' })
  @ApiOkResponse({ description: '용병 모집글 상세 반환' })
  @ApiNotFoundResponse({ description: '모집글 없음' })
  async findOne(@Param('id') id: string, @CurrentUser('id') userId?: string) {
    const post = await this.mercenaryService.findOne(id, userId);

    // Strip applicant personal info (nickname, profileImageUrl) for unauthenticated requests.
    // Public viewers may see that applications exist, but not who applied.
    if (!userId && post?.applications) {
      return {
        ...post,
        applications: post.applications.map(
          ({ user: _user, ...rest }: { user: unknown; [key: string]: unknown }) => rest,
        ),
      };
    }

    return post;
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '용병 모집글 생성 (팀 매니저+)' })
  @ApiCreatedResponse({ description: '모집글 생성 성공' })
  @ApiUnauthorizedResponse({ description: 'JWT required' })
  @ApiForbiddenResponse({ description: '팀 매니저+ 권한 필요' })
  async create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateMercenaryPostDto,
  ) {
    return this.mercenaryService.create(userId, dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '용병 모집글 수정 (작성자 또는 팀 매니저+)' })
  @ApiOkResponse({ description: '모집글 수정 성공' })
  @ApiUnauthorizedResponse({ description: 'JWT required' })
  @ApiForbiddenResponse({ description: '작성자 또는 팀 매니저+ 권한 필요' })
  async update(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateMercenaryPostDto,
  ) {
    return this.mercenaryService.update(id, userId, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '용병 모집글 삭제 (작성자 또는 팀 매니저+)' })
  @ApiOkResponse({ description: '모집글 삭제 성공' })
  @ApiUnauthorizedResponse({ description: 'JWT required' })
  @ApiForbiddenResponse({ description: '작성자 또는 팀 매니저+ 권한 필요' })
  async remove(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.mercenaryService.remove(id, userId);
  }

  @Post(':id/apply')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '용병 지원' })
  @ApiCreatedResponse({ description: '용병 지원 성공' })
  @ApiUnauthorizedResponse({ description: 'JWT required' })
  @ApiNotFoundResponse({ description: '모집글 없음' })
  async apply(
    @Param('id') postId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: ApplyMercenaryDto,
  ) {
    return this.mercenaryService.apply(postId, userId, dto);
  }

  @Patch(':id/applications/:appId/accept')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '용병 신청 승인 (팀 매니저+)' })
  @ApiOkResponse({ description: '신청 승인 성공' })
  @ApiUnauthorizedResponse({ description: 'JWT required' })
  @ApiForbiddenResponse({ description: '팀 매니저+ 권한 필요' })
  async acceptApplication(
    @Param('id') postId: string,
    @Param('appId') appId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.mercenaryService.acceptApplication(postId, appId, userId);
  }

  @Patch(':id/applications/:appId/reject')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '용병 신청 거절 (팀 매니저+)' })
  @ApiOkResponse({ description: '신청 거절 성공' })
  @ApiUnauthorizedResponse({ description: 'JWT required' })
  @ApiForbiddenResponse({ description: '팀 매니저+ 권한 필요' })
  async rejectApplication(
    @Param('id') postId: string,
    @Param('appId') appId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.mercenaryService.rejectApplication(postId, appId, userId);
  }

  @Delete(':id/applications/me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '내 용병 신청 취소' })
  @ApiOkResponse({ description: '신청 취소 성공' })
  @ApiUnauthorizedResponse({ description: 'JWT required' })
  async withdrawApplication(
    @Param('id') postId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.mercenaryService.withdrawApplication(postId, userId);
  }

  @Post(':id/close')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '용병 모집글 마감 (작성자 또는 팀 매니저+)' })
  @ApiOkResponse({ description: '모집글 마감 성공, 신청자 전원에게 알림 전송' })
  @ApiUnauthorizedResponse({ description: 'JWT required' })
  @ApiForbiddenResponse({ description: '작성자 또는 팀 매니저+ 권한 필요' })
  @ApiNotFoundResponse({ description: '모집글 없음' })
  async closePost(
    @Param('id') postId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.mercenaryService.closePost(postId, userId);
  }

  @Post(':id/cancel')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '용병 모집글 취소 (작성자 또는 팀 매니저+)' })
  @ApiOkResponse({ description: '모집글 취소 성공, 신청자 전원에게 알림 전송' })
  @ApiUnauthorizedResponse({ description: 'JWT required' })
  @ApiForbiddenResponse({ description: '작성자 또는 팀 매니저+ 권한 필요' })
  @ApiNotFoundResponse({ description: '모집글 없음' })
  async cancelPost(
    @Param('id') postId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.mercenaryService.cancelPost(postId, userId);
  }
}
