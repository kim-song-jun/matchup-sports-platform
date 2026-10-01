import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { TeamCompetitionEntriesDto } from './dto/team-competition-entries.dto';
import { TeamCompetitionEntriesService } from './team-competition-entries.service';

@ApiTags('tournaments')
@Controller('teams/:teamId/competition-entries')
@UseGuards(V1AuthGuard)
export class TeamCompetitionEntriesController {
  constructor(private readonly entries: TeamCompetitionEntriesService) {}

  @Get()
  @ApiOperation({ summary: '이 팀의 대회·리그 신청 목록과 참가 명단 수정 가능 여부 (팀 활성 멤버만, 비회원 403)' })
  @ApiOkResponse({ type: TeamCompetitionEntriesDto, description: '응답 본문의 data' })
  list(@CurrentUser() user: V1AuthUser, @Param('teamId') teamId: string) {
    return this.entries.list(user, teamId);
  }
}
