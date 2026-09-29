import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/current-user.decorator';
import { V1AuthGuard } from '../../auth/v1-auth.guard';
import type { V1AuthUser } from '../../auth/v1-auth-user';
import { CreateGameRosterAdjustmentDto } from './dto/game-roster-adjustment.dto';
import { GameRosterService } from './game-roster.service';

@ApiTags('games')
@Controller('games/:gameId/sides/:sideId')
@UseGuards(V1AuthGuard)
export class GameRosterController {
  constructor(private readonly gameRoster: GameRosterService) {}

  @Get('roster')
  @ApiOperation({ summary: '대회·리그 경기 한 팀의 명단 — 출전·빠짐·결장·출전정지 (그 팀 멤버·운영자)' })
  getRoster(@CurrentUser() user: V1AuthUser, @Param('gameId') gameId: string, @Param('sideId') sideId: string) {
    return this.gameRoster.getRoster(user, { gameId, sideId });
  }

  @Get('roster-adjustments')
  @ApiOperation({ summary: '경기 명단 변경 기록 — 빼기·되돌리기 시간순 (그 팀 멤버·운영자)' })
  listAdjustments(@CurrentUser() user: V1AuthUser, @Param('gameId') gameId: string, @Param('sideId') sideId: string) {
    return this.gameRoster.listAdjustments(user, { gameId, sideId });
  }

  @Post('roster-adjustments')
  @HttpCode(200)
  @ApiOperation({ summary: '이번 경기에서 선수 빼기 — 경기 시작 전만, 이미 빠져 있으면 alreadyApplied (팀 owner·manager·운영자)' })
  exclude(
    @CurrentUser() user: V1AuthUser,
    @Param('gameId') gameId: string,
    @Param('sideId') sideId: string,
    @Body() dto: CreateGameRosterAdjustmentDto,
  ) {
    return this.gameRoster.exclude(user, { gameId, sideId }, dto);
  }

  @Delete('roster-adjustments/:userId')
  @ApiOperation({ summary: '뺀 선수 되돌리기 — 경기 시작 전만, 빠져 있지 않으면 alreadyApplied (팀 owner·manager·운영자)' })
  revoke(
    @CurrentUser() user: V1AuthUser,
    @Param('gameId') gameId: string,
    @Param('sideId') sideId: string,
    @Param('userId') userId: string,
  ) {
    return this.gameRoster.revoke(user, { gameId, sideId }, userId);
  }
}
