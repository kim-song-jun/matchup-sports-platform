import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { V1AuthUser } from '../../auth/v1-auth-user';
import { GamesService } from '../../games/games.service';
import type { SaveGameLineupDto, SubmitGameLineupDto } from '../../games/dto/game-lineup.dto';
import {
  TournamentStaffAccessService,
  type TournamentStaffResource,
} from '../../tournaments/staff/tournament-staff-access.service';
import type { TournamentStaffAction } from '../../tournaments/staff/tournament-staff-policy';

type FixtureGameLookup = {
  readonly fieldId: string | null;
  readonly game: { readonly id: string } | null;
};

/**
 * Thin fixtureId -> gameId adapter over GamesService's already-shipped lineup
 * capture/submit methods (listLineups/saveLineup/submitLineup).
 *
 * GamesService.resolveActor() still performs the authoritative, full
 * role-scoped authorization for TOURNAMENT_FIXTURE-sourced games (the same
 * decideTournamentStaffAccess pure decision function that backs Task 7's
 * TournamentStaffAccessService -- see apps/v1_api/src/games/games.service.ts
 * resolveActor()), so this adapter does not re-implement that decision logic.
 *
 * Task 18 review P1-4: it previously ran that check TOO LATE. `resolveGameId()`
 * queried fixture/game existence FIRST and threw 404 immediately for a
 * nonexistent fixture/game -- before GamesService ever got a chance to
 * authorize the caller. An unauthenticated-for-this-tournament caller could
 * therefore fingerprint which fixture/game ids exist by comparing "404
 * immediately" (does not exist) against "403 from GamesService" (exists, but
 * I'm not allowed to see it) -- an existence oracle a denied caller should
 * never get. `authorizeAndResolveGameId()` fixes the order: it loads the
 * fixture row's `fieldId` (needed so a FIELD_OPERATOR scoped by *field*, not
 * by explicit fixtureId, is still correctly authorized for `read` -- see
 * tournament-staff-policy.ts's `fieldOrCourtId` scope check) and its linked
 * game id in ONE query, calls `TournamentStaffAccessService.assertAccess()`
 * with that resource FIRST, and only after that call succeeds does it decide
 * "not found" from the SAME already-fetched row. A caller who is not
 * authorized for this tournamentId/fixtureId/fieldId combination gets the
 * identical 403 STAFF_SCOPE_DENIED whether or not the fixture/game actually
 * exists; 404 TOURNAMENT_FIXTURE_GAME_NOT_FOUND is only ever reachable by a
 * caller who has already been authorized for that scope.
 */
@Injectable()
export class TournamentFixtureLineupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gamesService: GamesService,
    private readonly access: TournamentStaffAccessService,
  ) {}

  private async authorizeAndResolveGameId(
    userId: string,
    tournamentId: string,
    fixtureId: string,
    action: TournamentStaffAction,
  ): Promise<string> {
    const fixture: FixtureGameLookup | null = await this.prisma.v1TournamentFixture.findUnique({
      where: { tournamentId_id: { tournamentId, id: fixtureId } },
      select: { fieldId: true, game: { select: { id: true } } },
    });

    // Authorize FIRST, from whatever this lookup actually returned (a
    // nonexistent fixture yields `fieldId: undefined` here, same as an
    // existing-but-unassigned-field fixture would for scope purposes) --
    // never branch on existence before this call.
    const resource: TournamentStaffResource =
      fixture?.fieldId != null
        ? { tournamentId, fixtureId, fieldId: fixture.fieldId }
        : { tournamentId, fixtureId };
    await this.access.assertAccess({ userId, action, resource });

    if (fixture !== null) {
      // 대진 행이 **있다** — 이건 대회 경기다. 게임이 아직 없으면 그건 리그일 가능성이
      // 아니라 그냥 없는 것이므로, 팀매치를 뒤지지 않고 여기서 끝낸다(Copilot 리뷰 지적:
      // 아래 fallback 이 `game === null` 인 대회 대진에도 돌아 불필요한 조회를 했다).
      if (fixture.game !== null) return fixture.game.id;
      throw new NotFoundException({
        code: 'TOURNAMENT_FIXTURE_GAME_NOT_FOUND',
        message: '경기 정보를 찾을 수 없어요.',
      });
    }

    // ## 정규 리그 거울이면 경기는 `V1TeamMatch` 다 (Task 165 BE-4)
    // 정본 §4 가 "리그도 대회와 같은 콘솔" 로 확정했는데, 위 조회는 `V1TournamentFixture`
    // 만 본다 — 리그 경기의 id 는 **팀매치 id** 라 그 행이 없어 콘솔이 통째로 404 였다.
    //
    // **`resolveGameSource` 를 쓰지 않는다** — 그 함수는 *게임 → 출처* 방향이고
    // (`game.teamMatchId` 로 리그를 찾는다), 여기는 그 반대인 *출처 → 게임* 이다.
    // 방향이 달라 재사용이 성립하지 않는다.
    //
    // **인가 뒤에 조회한다.** 위 `assertAccess` 가 이미 끝났으므로 존재 여부로 분기해도
    // 권한 판정이 그것에 영향받지 않는다(이 함수 맨 위 주석의 불변식). 리그 거울에는
    // 대진 스코프가 없어 `{ tournamentId, fixtureId }` 리소스로 걸리는데, 그건 대회
    // 스태프·플랫폼 관리자만 통과하는 것과 같은 규칙이다(#982 의 결과 경계와 동일).
    const leagueTeamMatch = await this.prisma.v1TeamMatch.findFirst({
      where: { id: fixtureId, leagueId: tournamentId, deletedAt: null },
      select: { game: { select: { id: true } } },
    });
    if (leagueTeamMatch?.game != null) {
      return leagueTeamMatch.game.id;
    }

    throw new NotFoundException({
      code: 'TOURNAMENT_FIXTURE_GAME_NOT_FOUND',
      message: '경기 정보를 찾을 수 없어요.',
    });
  }

  /**
   * Task 21 addition: the response now carries `gameId` alongside `lineups`
   * (previously a bare `V1GameLineup[]`) -- the live operations console
   * resolves `fixtureId -> gameId` here BEFORE any lineup has ever been
   * saved (an empty `lineups` array on its own carried no id to call any
   * `/games/:gameId/*` route with).
   *
   * This is a shape change, not a field addition. Its consumers are known and
   * both were updated in the same change, so this is not an unreviewed break:
   *   - the live operations console added by this task reads `gameId` and
   *     `lineups` directly (apps/v1_web/.../operate/operate-console.tsx)
   *   - the pre-existing integration coverage from the Task 18 merge
   *     (test/tournaments/tournament-operations-board.integration-spec.ts) had
   *     its assertions moved to the new envelope
   * An earlier draft of this comment claimed there was no consumer at all;
   * that was wrong even as written, since the console above is part of this
   * same task. See `docs/api/domains/tournament-operations.md`'s Task 21 note.
   */
  async listLineups(user: V1AuthUser, tournamentId: string, fixtureId: string) {
    const gameId = await this.authorizeAndResolveGameId(user.id, tournamentId, fixtureId, 'read');
    const lineups = await this.gamesService.listLineups(user, gameId);
    return { gameId, lineups };
  }

  async saveLineup(
    user: V1AuthUser,
    tournamentId: string,
    fixtureId: string,
    sideId: string,
    idempotencyKey: string | undefined,
    dto: SaveGameLineupDto,
  ) {
    const gameId = await this.authorizeAndResolveGameId(
      user.id,
      tournamentId,
      fixtureId,
      'lineup_mutate',
    );
    return this.gamesService.saveLineup(user, gameId, sideId, idempotencyKey, dto);
  }

  async submitLineup(
    user: V1AuthUser,
    tournamentId: string,
    fixtureId: string,
    lineupId: string,
    idempotencyKey: string | undefined,
    dto: SubmitGameLineupDto,
  ) {
    const gameId = await this.authorizeAndResolveGameId(
      user.id,
      tournamentId,
      fixtureId,
      'lineup_mutate',
    );
    return this.gamesService.submitLineup(user, gameId, lineupId, idempotencyKey, dto);
  }
}
