import { Controller, Get, NotFoundException, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { CalendarFeedService, frontendOrigin } from './calendar-feed.service';

/** 구독 주소를 만들 때 쓰는 사이트 주소 — 설정이 없는 로컬에서는 요청 주소를 따른다. */
function originOf(request: Request): string {
  if (process.env.FRONTEND_URL?.trim()) return frontendOrigin();
  const proto = request.headers['x-forwarded-proto'] ?? request.protocol;
  const host = request.headers['x-forwarded-host'] ?? request.headers.host;
  return typeof host === 'string' ? `${String(proto).split(',')[0]}://${host.split(',')[0]}` : frontendOrigin();
}

/** 공통 응답 감싸기(TransformInterceptor)를 거치지 않고 `.ics` 를 그대로 내려 준다. 개인 일정이라 캐시는 짧게 사적으로만. */
function sendIcs(res: Response, body: string, filename: string, disposition: 'inline' | 'attachment') {
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `${disposition}; filename="${filename}"`);
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(body);
}

@Controller('me/calendar-feed')
@UseGuards(V1AuthGuard)
export class MyCalendarFeedController {
  constructor(private readonly feed: CalendarFeedService) {}

  @Get()
  status(@CurrentUser() user: V1AuthUser, @Req() request: Request) {
    return this.feed.status(user, originOf(request));
  }

  @Post()
  connect(@CurrentUser() user: V1AuthUser, @Req() request: Request) {
    return this.feed.ensure(user, originOf(request));
  }

  @Post('regenerate')
  regenerate(@CurrentUser() user: V1AuthUser, @Req() request: Request) {
    return this.feed.regenerate(user, originOf(request));
  }
}

/** 폰 캘린더가 부르는 공개 주소 — 로그인 쿠키가 없고, 주소 안의 토큰이 곧 인증이다. */
@Controller('calendar')
export class CalendarFeedPublicController {
  constructor(private readonly feed: CalendarFeedService) {}

  @Get('feed/:file')
  async feedFile(@Param('file') file: string, @Res() res: Response) {
    if (!file.endsWith('.ics')) {
      throw new NotFoundException({ code: 'CALENDAR_FEED_NOT_FOUND', message: '캘린더 주소를 찾을 수 없어요.' });
    }
    sendIcs(res, await this.feed.feedForToken(file.slice(0, -'.ics'.length)), 'teameet.ics', 'inline');
  }
}

@Controller('teams/:teamId/schedules/:scheduleId')
@UseGuards(V1AuthGuard)
export class ScheduleCalendarFileController {
  constructor(private readonly feed: CalendarFeedService) {}

  @Get('calendar.ics')
  async file(
    @CurrentUser() user: V1AuthUser,
    @Param('teamId') teamId: string,
    @Param('scheduleId') scheduleId: string,
    @Res() res: Response,
  ) {
    sendIcs(res, await this.feed.scheduleFile(user, teamId, scheduleId), 'teameet-schedule.ics', 'attachment');
  }
}
