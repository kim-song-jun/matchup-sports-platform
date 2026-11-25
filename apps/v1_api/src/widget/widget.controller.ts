import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { WidgetHomeService } from './widget-home.service';
import { WIDGET_DEFAULT_LIMIT, WIDGET_MAX_LIMIT, WidgetService } from './widget.service';

export class WidgetGamesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(WIDGET_MAX_LIMIT)
  limit?: number;
}

export class WidgetResponseDto {
  @IsIn(['GOING', 'MAYBE', 'NOT_GOING'])
  status!: 'GOING' | 'MAYBE' | 'NOT_GOING';
}

/** 앱이 로그인 쿠키로 위젯 토큰을 받는다(기기마다 하나). */
@Controller('me/widget-token')
@UseGuards(V1AuthGuard)
export class MyWidgetTokenController {
  constructor(private readonly widget: WidgetService) {}

  @Post()
  issue(@CurrentUser() user: V1AuthUser) {
    return this.widget.issueToken(user);
  }

  /** 폰을 잃어버렸을 때처럼 기기에서 직접 지울 수 없을 때 — 내 위젯 토큰을 전부 폐기한다. */
  @Delete()
  revokeAll(@CurrentUser() user: V1AuthUser) {
    return this.widget.revokeAll(user);
  }
}

/** 위젯·실시간 표시가 부르는 주소 — 로그인 쿠키가 아니라 `Authorization: Bearer <위젯 토큰>` 이다. 읽기 외에 쓸 수 있는 것은 내 참석 응답 하나뿐이다. */
@Controller('widget')
export class WidgetController {
  constructor(
    private readonly widget: WidgetService,
    private readonly home: WidgetHomeService,
  ) {}

  @Get('home')
  async homeSummary(@Headers('authorization') authorization: string | undefined) {
    const { userId } = await this.widget.authenticate(authorization);
    return this.home.home(userId);
  }

  @Put('schedules/:scheduleId/attendance')
  @HttpCode(200)
  async respond(
    @Headers('authorization') authorization: string | undefined,
    @Param('scheduleId') scheduleId: string,
    @Body() dto: WidgetResponseDto,
  ) {
    const { userId } = await this.widget.authenticate(authorization);
    return this.home.setResponse(userId, scheduleId, dto.status);
  }

  @Get('games')
  async games(@Headers('authorization') authorization: string | undefined, @Query() query: WidgetGamesQueryDto) {
    const { userId } = await this.widget.authenticate(authorization);
    return this.widget.games(userId, query.limit ?? WIDGET_DEFAULT_LIMIT);
  }

  @Delete('token')
  async revoke(@Headers('authorization') authorization: string | undefined) {
    const { tokenId } = await this.widget.authenticate(authorization);
    return this.widget.revoke(tokenId);
  }
}
