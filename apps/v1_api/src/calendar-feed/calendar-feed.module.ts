import { Module } from '@nestjs/common';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { CalendarFeedPublicController, MyCalendarFeedController, ScheduleCalendarFileController } from './calendar-feed.controller';
import { CalendarFeedService } from './calendar-feed.service';

/** 폰 기본 캘린더 연동 — 구독 주소(`/calendar/feed/<토큰>.ics`)와 일정 한 건 내려받기. */
@Module({
  controllers: [MyCalendarFeedController, CalendarFeedPublicController, ScheduleCalendarFileController],
  providers: [CalendarFeedService, V1AuthGuard],
})
export class CalendarFeedModule {}
