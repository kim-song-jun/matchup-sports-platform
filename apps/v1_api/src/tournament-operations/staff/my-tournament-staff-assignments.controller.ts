import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../auth/current-user.decorator';
import { V1AuthGuard } from '../../auth/v1-auth.guard';
import type { V1AuthUser } from '../../auth/v1-auth-user';
import { MyTournamentStaffAssignmentsService } from './my-tournament-staff-assignments.service';

/**
 * `GET /tournament-ops/me/assignments` — 로그인한 사용자의 대회 스태프 배정 목록.
 *
 * 대회 스코프 가드(`TournamentStaffGuard`)를 쓰지 않는다: 이 라우트에는 대회 경로 파라미터
 * 자체가 없고, 조회 범위가 "요청자 본인"으로 이미 닫혀 있기 때문이다. 인증(V1AuthGuard) 만
 * 세우고 대상 userId 는 `@CurrentUser()` 에서만 읽는다 — 다른 사람의 배정을 지정할 입력이
 * 존재하지 않는 것이 이 엔드포인트의 인가 근거다.
 */
@Controller('tournament-ops/me/assignments')
@UseGuards(V1AuthGuard)
export class MyTournamentStaffAssignmentsController {
  constructor(private readonly assignments: MyTournamentStaffAssignmentsService) {}

  @Get()
  list(@CurrentUser() user: V1AuthUser) {
    return this.assignments.listMine(user.id);
  }
}
