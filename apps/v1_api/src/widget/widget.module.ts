import { Module } from '@nestjs/common';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { WebPushModule } from '../notifications/web-push.module';
import { TeamLineupsModule } from '../team-lineups/team-lineups.module';
import { TeamSchedulesModule } from '../team-schedules/team-schedules.module';
import { WidgetHomeService } from './widget-home.service';
import { WidgetPushService } from './widget-push.service';
import { WidgetScorersService } from './widget-scorers.service';
import { MyWidgetTokenController, WidgetController } from './widget.controller';
import { WidgetService } from './widget.service';

/** 위젯(바탕화면·잠금화면)과 실시간 표시가 읽는 "내 팀 경기" — 로그인 쿠키 없이 위젯 토큰으로. */
@Module({
  imports: [TeamLineupsModule, TeamSchedulesModule, WebPushModule],
  controllers: [MyWidgetTokenController, WidgetController],
  providers: [WidgetService, WidgetHomeService, WidgetScorersService, WidgetPushService, V1AuthGuard],
})
export class WidgetModule {}
