import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import { AdminContextService } from '../common/admin-context.service';
import { AdminOpsService } from './admin-ops.service';

class RecentPushFailuresQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

class AckPushFailuresDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  ids!: string[];
}

@Controller('admin/ops')
@UseGuards(V1AuthGuard)
export class AdminOpsController {
  constructor(
    private readonly adminOpsService: AdminOpsService,
    private readonly adminContext: AdminContextService,
  ) {}

  @Get('recent-push-failures')
  async recentPushFailures(@CurrentUser() user: V1AuthUser, @Query() query: RecentPushFailuresQueryDto) {
    await this.adminContext.getActiveAdmin(user.id);
    return this.adminOpsService.recentPushFailures(query.limit ?? 20);
  }

  @Post('push-failures/ack')
  async ackPushFailures(@CurrentUser() user: V1AuthUser, @Body() dto: AckPushFailuresDto) {
    await this.adminContext.getMutationAdmin(user.id);
    return this.adminOpsService.acknowledgeFailures(dto.ids, user.id);
  }
}
