import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../auth/current-user.decorator';
import { V1AuthGuard } from '../../auth/v1-auth.guard';
import { V1AuthUser } from '../../auth/v1-auth-user';
import { AdminDisciplineService } from './admin-discipline.service';

/**
 * 플랫폼 어드민(owner·ops·support) 전용 — 대회·리그 징계 현황(MD-QA #191).
 *
 * GET /admin/tournaments/:tournamentId/discipline   정지 중·경고 임박·카드 받은 선수 목록(리그 id 도 같은 경로)
 */
@Controller()
@UseGuards(V1AuthGuard)
export class AdminDisciplineController {
  constructor(private readonly service: AdminDisciplineService) {}

  @Get('admin/tournaments/:tournamentId/discipline')
  overview(@CurrentUser() user: V1AuthUser, @Param('tournamentId') tournamentId: string) {
    return this.service.overview(user, tournamentId);
  }
}
