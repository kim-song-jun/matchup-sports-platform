import { Injectable } from '@nestjs/common';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { LineupTodoService } from './lineup-todo.service';
import { assertTeamLineupMember } from './team-lineup-access';

/**
 * 팀 화면의 "다가오는 경기" — 전술보드로 들어가는 입구.
 *
 * 수집은 `LineupTodoService` 가 이미 하고 있다(대회 픽스처 + 팀매치를 한 경로에서 모은다).
 * 여기서 하는 일은 두 가지뿐이다: **누가 볼 수 있는지 판정**하고, 화면이 바로 쓸 모양으로
 * 옮겨 담는다. 수집 로직을 복사하지 않는 것이 요점이다 — 두 벌이 되면 한쪽만 고쳐지는
 * 순간 홈의 할 일 카드와 이 목록이 서로 다른 경기를 보여주기 시작한다.
 */
@Injectable()
export class TeamUpcomingGamesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lineupTodos: LineupTodoService,
  ) {}

  async listForTeam(user: V1AuthUser, teamId: string) {
    // 전술보드 읽기와 같은 선 — 활성 팀원이면 본다. 팀이 없으면 404, 팀원이 아니면 403.
    await assertTeamLineupMember(this.prisma, teamId, user.id);
    const games = await this.lineupTodos.listUpcomingForTeam(teamId, new Date());
    return {
      items: games.map((game) => ({
        gameId: game.gameId,
        source: game.source,
        title: game.title,
        opponentName: game.opponentName,
        scheduledAt: game.scheduledAt,
        tournamentId: game.tournamentId,
        tournamentTitle: game.tournamentTitle,
        // 라인업 상태는 그대로 넘긴다 — 전술보드와는 다른 축이지만, 팀장이 "라인업은
        // 냈나"를 같은 줄에서 확인할 수 있어야 두 화면을 오가지 않는다.
        lineupState: game.lineupState,
      })),
    };
  }
}
