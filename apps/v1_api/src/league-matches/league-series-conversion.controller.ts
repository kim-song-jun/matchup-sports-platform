import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthUser } from '../auth/v1-auth-user';
import { Throttle } from '@nestjs/throttler';
import { LeagueSeriesConversionService } from './league-series-conversion.service';
import { CommitLeagueConversionDto, PreviewLeagueConversionDto } from './dto/league-series-conversion.dto';

@Controller('admin/league-matches/:leagueId/series-conversion')
@UseGuards(V1AuthGuard)
export class LeagueSeriesConversionController {
  constructor(private readonly service: LeagueSeriesConversionService) {}
  @Get()
  status(@CurrentUser() user: V1AuthUser, @Param('leagueId', ParseUUIDPipe) id: string) { return this.service.status(user, id); }
  @Post('preview')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  preview(@CurrentUser() user: V1AuthUser, @Param('leagueId', ParseUUIDPipe) id: string, @Body() dto: PreviewLeagueConversionDto) { return this.service.preview(user, id, dto); }
  @Post('commit')
  commit(@CurrentUser() user: V1AuthUser, @Param('leagueId', ParseUUIDPipe) id: string, @Body() dto: CommitLeagueConversionDto) { return this.service.commit(user, id, dto); }
}
