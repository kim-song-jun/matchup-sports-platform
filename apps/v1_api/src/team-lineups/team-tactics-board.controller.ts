import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { SaveTeamTacticsBoardDto } from './dto/team-tactics-board.dto';
import { TeamTacticsBoardService } from './team-tactics-board.service';

/**
 * 팀 전술보드 — 그 팀의 이 경기 배치.
 *
 * 경로를 팀으로 시작하는 이유: 이 자원의 주인은 경기가 아니라 팀이다. 같은 경기에 보드가
 * 둘(양 팀) 있고 서로 절대 보이면 안 되므로, 팀을 URL 에 두면 권한 검증이 조회 이전에
 * 팀 단위로 끝난다 — 사이드 id 를 받아 나중에 대조하는 형태보다 새는 경로가 적다.
 */
@Controller('teams/:teamId/games/:gameId/tactics-board')
@UseGuards(V1AuthGuard)
export class TeamTacticsBoardController {
  constructor(private readonly service: TeamTacticsBoardService) {}

  /** 활성 팀원이면 누구나 본다 — 자기가 어디서 뛰는지 알아야 하기 때문이다. */
  @Get()
  get(
    @CurrentUser() user: V1AuthUser,
    @Param('teamId') teamId: string,
    @Param('gameId') gameId: string,
  ) {
    return this.service.get(user, teamId, gameId);
  }

  /** 고치는 것은 운영진(owner/manager)만. 엔트리는 전체 교체다(부분 병합 없음). */
  @Put()
  save(
    @CurrentUser() user: V1AuthUser,
    @Param('teamId') teamId: string,
    @Param('gameId') gameId: string,
    @Body() dto: SaveTeamTacticsBoardDto,
  ) {
    return this.service.save(user, teamId, gameId, dto);
  }
}
