import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../auth/current-user.decorator';
import { V1AuthGuard } from '../../auth/v1-auth.guard';
import type { V1AuthUser } from '../../auth/v1-auth-user';
import { TournamentOperationsStaffService } from './tournament-operations-staff.service';

/**
 * "내 담당 대회" 진입점 (마이페이지). `TournamentOperationsStaffController`(위 파일)의
 * `GET /tournament-ops/tournaments/:tournamentId/staff`와 달리 이 라우트는 tournamentId를
 * 모르는 호출자를 위한 것이라 tournament/fixture-scoped 권한 체크가 필요 없다 -- 자기 자신의
 * 유효한 배정만 돌려주는 self-scoped read다(`V1AuthGuard`만으로 충분).
 *
 * `MyMatchesController`(apps/v1_api/src/matches/my-matches.controller.ts)와
 * `MyScheduleController`(apps/v1_api/src/team-schedules/my-schedule.controller.ts)와 동일하게
 * 'me' 프리픽스를 쓰는 별도의 얇은 컨트롤러로 도메인 폴더(tournament-operations/staff/)에
 * co-locate한다.
 */
@Controller('me')
@UseGuards(V1AuthGuard)
export class MyTournamentStaffController {
  constructor(private readonly staff: TournamentOperationsStaffService) {}

  @Get('tournament-staff')
  myAssignments(@CurrentUser() user: V1AuthUser) {
    return this.staff.myAssignments(user.id);
  }
}
