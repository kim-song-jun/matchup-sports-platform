import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../auth/current-user.decorator';
import { V1AuthGuard } from '../../auth/v1-auth.guard';
import type { V1AuthUser } from '../../auth/v1-auth-user';
import { AdminContextService } from '../../common/admin-context.service';
import { PublicTournamentRecordsService } from './public-tournament-records.service';

/**
 * 회고 STATS-3 — 수상 탭 추천 근거용 어드민 랭킹.
 * `tournaments-admin.controller.ts`와 같은 관례: `V1AuthGuard` + 서비스 진입 전
 * `AdminContextService.getActiveAdmin`. 공개 랭킹(`/tournaments/:id/player-records`)
 * 과 달리 **동의 게이팅이 없다** — 어드민이 수상자를 고를 때는 진짜 순위가 필요하다.
 */
@Controller('admin/tournaments')
@UseGuards(V1AuthGuard)
export class AdminTournamentPlayerRecordsController {
  constructor(
    private readonly tournamentRecords: PublicTournamentRecordsService,
    private readonly adminContext: AdminContextService,
  ) {}

  @Get(':tournamentId/player-records')
  async getPlayerRecords(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId') tournamentId: string,
  ) {
    await this.adminContext.getActiveAdmin(user.id);
    return this.tournamentRecords.getPlayerRecordsForAdmin(tournamentId);
  }
}
