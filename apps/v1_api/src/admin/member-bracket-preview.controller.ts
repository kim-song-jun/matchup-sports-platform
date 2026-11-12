import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { StartMemberBracketPreviewDto } from './dto/member-bracket-preview.dto';
import { MemberBracketPreviewService } from './member-bracket-preview.service';

@Controller('admin/users/:userId/bracket-preview')
@UseGuards(V1AuthGuard)
export class MemberBracketPreviewController {
  constructor(private readonly previews: MemberBracketPreviewService) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Header('Cache-Control', 'private, no-store')
  start(@CurrentUser() admin: V1AuthUser, @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: StartMemberBracketPreviewDto) {
    return this.previews.start(admin.id, userId, dto);
  }

  @Get(':previewId')
  @Header('Cache-Control', 'private, no-store')
  read(@CurrentUser() admin: V1AuthUser, @Param('userId', ParseUUIDPipe) userId: string,
    @Param('previewId', ParseUUIDPipe) previewId: string) {
    return this.previews.read(admin.id, userId, previewId);
  }
}
