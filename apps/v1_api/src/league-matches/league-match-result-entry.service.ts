import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AdminContextService, type V1ActiveAdmin } from '../common/admin-context.service';
import { canonicalGameCommandPayloadHash, GamesService } from '../games/games.service';
import { PrismaService } from '../prisma/prisma.service';
import { V1AuthUser } from '../auth/v1-auth-user';
import { RecordLeagueResultDto } from './dto/league-match-result-entry.dto';
import { parseStoredScore } from './league-lifecycle-rules';
import {
  assembleLeagueResultParticipants,
  type AssembledResultParticipant,
} from './league-result-participants';

/**
 * D1-a: 운영자가 리그 대진 결과를 직접 입력·정정하는 경로 -- 사용자 확정 결정
 * "운영자가 기본 입력자, 팀은 확인만"의 백엔드.
 *
 * ## 신규 입력 (recordResult)
 * 아직 결과가 없는 대진에 운영자가 스코어를 넣고 즉시 OFFICIAL 까지 확정한다.
 * `league-match-forfeit.service.ts`가 이미 프로덕션에서 쓰는 것과 정확히 같은 3단계
 * (`GamesService.createResultRevision` -> `submitResultRevision` ->
 * `decideResultRevision('approve')`)를 admin 권한으로 이어 붙인다 -- `resolveActor`가
 * TEAM_MATCH 에서 활성 비-support 어드민에게 action 무관 무조건 통과를 주기 때문에
 * 새 인가 코드가 필요 없다(`games.service.ts`의 admin 패스스루 참고).
 *
 * **미확정 정책**: 이 경로는 결과가 확정되기까지 상대팀의 별도 승인을 요구하지
 * 않는다(운영자 혼자 3단계를 전부 수행). "운영자 신규 입력에도 상대팀 승인이
 * 필요한가"는 사용자가 아직 정하지 않았다 -- 필요해지면 마지막 decide 호출만
 * 떼어내 상대팀의 별도 액션으로 옮기면 된다(구조상 이미 분리돼 있다).
 *
 * ## 정정 (correctResult)
 * 이미 OFFICIAL 인 결과를 새 스코어로 덮어쓴다. TEAM_MATCH 에는 이 경로가 기존에
 * 없었다(대회 픽스처의 CORRECTION flow는 `tournament-result-review.service.ts`가
 * TEAM_MATCH 를 명시적으로 거부한다) -- 그래서 `GamesService`에 TEAM_MATCH 전용
 * correction 메서드 2개(`createTeamMatchResultCorrection` /
 * `officializeTeamMatchResultCorrection`)를 새로 추가했다. 이 서비스는 그 둘을
 * 이어 붙인다(OFFICIAL -> 새 DRAFT -> OFFICIAL, 상대팀 재승인 없이 즉시 확정 --
 * 정정은 이미 확정된 결과를 되돌리는 운영 조작이라 재승인 루프를 새로 만들지 않았다).
 *
 * 정정은 forfeit 과 달리 "한 번뿐인 종결 조작"이 아니다 -- 같은 대진을 여러 번
 * 정정할 수 있어야 한다(잘못 고친 것을 또 고치는 경우). 그래서 멱등 판정은 forfeit
 * 처럼 "과거에 우리가 정정한 적이 있는가"가 아니라 "요청한 스코어·사유가 **현재**
 * 공식 결과와 이미 일치하는가"로 좁혔다 -- 그래야 같은 요청의 중복 재시도는
 * no-op 이 되면서도, 의도적으로 다른 스코어를 넣는 두 번째 정정은 막히지 않는다.
 * **트레이드오프**: forfeit 의 "항상 저장된 값을 그대로 돌려준다" 방식과 달리, 이
 * 방식은 매 재시도마다 `reason` 문자열까지 요청과 저장값을 비교한다 -- 클라이언트가
 * 재시도마다 `reason`에 임의 문자열(예: uuid)을 섞어 보내는 버그가 있다면 그 요청은
 * "중복"으로 인식되지 못하고 매번 새 정정 리비전을 만든다. 정상적인 클라이언트라면
 * 재시도 시 완전히 같은 페이로드를 보내므로 실전에서는 문제되지 않는다.
 *
 * ## 재시도
 * `league-match-forfeit.service.ts`와 동일한 이유로 동일한 백오프(300ms, 1회)를
 * 쓴다 -- create/submit/decide(또는 correction-create/officialize) 각각이 별도
 * 트랜잭션이라 동시 처리 시 뒤늦은 요청이 40001(Postgres 직렬화 충돌)로 부딪힐 수
 * 있다.
 */

export const RESULT_ENTRY_REASON_MARKER = '[LEAGUE_RESULT_ENTRY]';
export const RESULT_CORRECTION_REASON_MARKER = '[LEAGUE_RESULT_CORRECTION]';

const RETRY_BACKOFF_MS = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** GamesService 가 동시성 충돌에 붙이는 코드. league-match-forfeit.service.ts 와 동일. */
function isConcurrencyConflict(error: unknown): boolean {
  if (!(error instanceof ConflictException)) return false;
  const response = error.getResponse();
  return (
    typeof response === 'object' &&
    response !== null &&
    (response as { code?: unknown }).code === 'COMMAND_CONCURRENCY_CONFLICT'
  );
}

type MatchedFixture = {
  id: string;
  status: string;
  gameId: string;
  gameVersion: number;
};

@Injectable()
export class LeagueMatchResultEntryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminContext: AdminContextService,
    private readonly games: GamesService,
  ) {}

  async recordResult(user: V1AuthUser, leagueId: string, teamMatchId: string, dto: RecordLeagueResultDto) {
    return this.withRetry(() => this.recordResultOnce(user, leagueId, teamMatchId, dto));
  }

  async correctResult(user: V1AuthUser, leagueId: string, teamMatchId: string, dto: RecordLeagueResultDto) {
    return this.withRetry(() => this.correctResultOnce(user, leagueId, teamMatchId, dto));
  }

  private async withRetry<T>(attempt: () => Promise<T>): Promise<T> {
    try {
      return await attempt();
    } catch (error) {
      if (!isConcurrencyConflict(error)) throw error;
      await sleep(RETRY_BACKOFF_MS);
      try {
        return await attempt();
      } catch (retryError) {
        if (!isConcurrencyConflict(retryError)) throw retryError;
        throw new ConflictException({
          code: 'COMMAND_CONCURRENCY_CONFLICT',
          message: '같은 대진을 동시에 처리하고 있어요. 잠시 후 다시 시도해 주세요.',
        });
      }
    }
  }

  private async loadMatchedFixture(leagueId: string, teamMatchId: string): Promise<MatchedFixture> {
    const teamMatch = await this.prisma.v1TeamMatch.findFirst({
      where: { id: teamMatchId, leagueId },
      select: {
        id: true,
        status: true,
        approvedApplicantTeamId: true,
        game: { select: { id: true, version: true } },
      },
    });
    if (teamMatch === null) {
      throw new NotFoundException({ code: 'LEAGUE_NOT_FOUND', message: '이 리그의 대진이 아니에요.' });
    }
    if (teamMatch.approvedApplicantTeamId === null || teamMatch.game === null) {
      throw new ConflictException({
        code: 'LEAGUE_FIXTURE_NOT_MATCHED',
        message: '상대팀이 확정되지 않은 대진은 결과를 처리할 수 없어요.',
      });
    }
    if (teamMatch.status === 'cancelled') {
      throw new ConflictException({
        code: 'LEAGUE_FIXTURE_CANCELLED',
        message: '이미 취소된 대진은 결과를 처리할 수 없어요.',
      });
    }
    // game 은 위에서 이미 null 체크를 했지만, 아래에 await 가 여러 번 끼어들어 TS 의
    // property narrowing 이 유지된다고 보장할 수 없다(league-match-forfeit.service.ts
    // 와 동일한 이유) -- 별도 모양으로 뽑아 고정한다.
    return {
      id: teamMatch.id,
      status: teamMatch.status,
      gameId: teamMatch.game.id,
      gameVersion: teamMatch.game.version,
    };
  }

  /**
   * U1 모달의 득점자 선택 목록. 대진 생성이 이미 만들어 둔 게임 로스터
   * (양 팀 전체 active 멤버 — league-match-admin.service.ts 생성 루프)를
   * 사이드별로 돌려준다. 읽기 전용이라 getActiveAdmin 게이트를 쓴다
   * (league-match-dispute.service.listDisputes 와 동일).
   */
  async listFixtureParticipants(user: V1AuthUser, leagueId: string, teamMatchId: string) {
    await this.adminContext.getActiveAdmin(user.id);
    const fixture = await this.loadMatchedFixture(leagueId, teamMatchId);
    const [sides, participants] = await Promise.all([
      this.prisma.v1GameSide.findMany({
        where: { gameId: fixture.gameId },
        select: { id: true, sideKey: true, displayNameSnapshot: true },
      }),
      this.prisma.v1GameParticipant.findMany({
        where: { gameId: fixture.gameId },
        select: { id: true, sideId: true, displayNameSnapshot: true },
        orderBy: { displayNameSnapshot: 'asc' },
      }),
    ]);
    const bySide = (sideKey: 'HOME' | 'AWAY') => {
      const side = sides.find((row) => row.sideKey === sideKey);
      return {
        teamName: side?.displayNameSnapshot ?? (sideKey === 'HOME' ? '홈 팀' : '원정 팀'),
        players:
          side === undefined
            ? []
            : participants
                .filter((row) => row.sideId === side.id)
                .map((row) => ({ participantId: row.id, name: row.displayNameSnapshot })),
      };
    };
    return { leagueId, teamMatchId, home: bySide('HOME'), away: bySide('AWAY') };
  }

  /**
   * dto.participants(선택)를 GamesService 가 받는 actualParticipants 로 변환한다.
   * 검증(이 게임 소속·중복·사이드별 합 ≤ 스코어)은 순수 모듈
   * league-result-participants.ts 가 수행하고, 여기서는 조회와 예외 변환만 한다.
   */
  private async resolveActualParticipants(
    gameId: string,
    dto: RecordLeagueResultDto,
  ): Promise<AssembledResultParticipant[]> {
    if (dto.participants === undefined || dto.participants.length === 0) return [];
    const [gameParticipants, sides] = await Promise.all([
      this.prisma.v1GameParticipant.findMany({
        where: { gameId, id: { in: dto.participants.map((stat) => stat.participantId) } },
        select: { id: true, sideId: true },
      }),
      this.prisma.v1GameSide.findMany({ where: { gameId }, select: { id: true, sideKey: true } }),
    ]);
    const result = assembleLeagueResultParticipants({
      participants: dto.participants,
      gameParticipants,
      sides: sides.map((side) => ({ id: side.id, sideKey: side.sideKey as 'HOME' | 'AWAY' })),
      homeScore: dto.homeScore,
      awayScore: dto.awayScore,
    });
    if (!result.ok) {
      throw new BadRequestException({ code: result.code, message: result.message });
    }
    return result.actualParticipants;
  }

  // ─── 신규 입력 ──────────────────────────────────────────────────────────────

  private async recordResultOnce(
    user: V1AuthUser,
    leagueId: string,
    teamMatchId: string,
    dto: RecordLeagueResultDto,
  ) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const teamMatch = await this.loadMatchedFixture(leagueId, teamMatchId);
    const gameId = teamMatch.gameId;
    const initialGameVersion = teamMatch.gameVersion;
    const persistedReason = `${RESULT_ENTRY_REASON_MARKER} ${dto.reason.trim()}`;

    const latestRevision = await this.prisma.v1GameResultRevision.findFirst({
      where: { gameId },
      orderBy: { revision: 'desc' },
      select: { id: true, revision: true, state: true, reason: true, score: true },
    });
    const isOurEntry = latestRevision?.reason?.startsWith(RESULT_ENTRY_REASON_MARKER) ?? false;

    if (latestRevision !== null && latestRevision.state === 'OFFICIAL') {
      if (isOurEntry) {
        // 멱등 응답은 저장된 값을 그대로 돌려준다(league-match-forfeit.service.ts 와
        // 같은 이유) -- 재시도가 요청과 다른 스코어를 실었더라도 이미 확정된 값을
        // 고쳤다고 착각하게 만들지 않는다. 스코어를 바꾸려면 별도의 정정
        // (correctResult) 경로를 쓴다.
        const stored = parseStoredScore(latestRevision.score);
        return {
          teamMatchId,
          leagueId,
          homeScore: stored?.home ?? dto.homeScore,
          awayScore: stored?.away ?? dto.awayScore,
          resultRevisionId: latestRevision.id,
          alreadyProcessed: true,
        };
      }
      throw new ConflictException({
        code: 'LEAGUE_FIXTURE_RESULT_ALREADY_OFFICIAL',
        message: '이미 공식 결과가 확정된 대진이에요. 정정이 필요하면 결과 정정 절차를 이용해 주세요.',
      });
    }

    // 재시도 가능 지점: 직전 시도가 create(DRAFT)나 submit(SUBMITTED) 직후 decide 전에
    // 끊긴 경우 -- 새 리비전을 또 만들지 않고 그 지점부터 이어간다.
    const resumable =
      latestRevision !== null &&
      isOurEntry &&
      (latestRevision.state === 'DRAFT' || latestRevision.state === 'SUBMITTED');
    if (latestRevision !== null && latestRevision.state !== 'CHANGE_REQUESTED' && !resumable) {
      throw new ConflictException({
        code: 'LEAGUE_FIXTURE_RESULT_IN_PROGRESS',
        message: '이미 처리 중이거나 이력이 있는 결과가 있어 입력할 수 없어요.',
      });
    }

    const attempt = (latestRevision?.revision ?? 0) + (resumable ? 0 : 1);
    const commandPrefix = `league-result-entry:${gameId}:${attempt}`;

    let revisionId: string;
    let revisionState: string;
    let version: number;

    if (resumable) {
      revisionId = latestRevision!.id;
      revisionState = latestRevision!.state;
      version = (
        await this.prisma.v1Game.findUniqueOrThrow({ where: { id: gameId }, select: { version: true } })
      ).version;
    } else {
      const createCommandId = `${commandPrefix}:create`;
      const created = await this.games.createResultRevision(user, gameId, createCommandId, {
        expectedVersion: initialGameVersion,
        clientCommandId: createCommandId,
        score: { home: dto.homeScore, away: dto.awayScore },
        // 선수별 득점·도움(선택). 이벤트는 계속 싣지 않는다 — TEAM_MATCH 무이벤트
        // 면제(game-invariants.ts Task 17 Option A)가 참가자 합계를 권위로 받아 준다.
        actualParticipants: await this.resolveActualParticipants(gameId, dto),
        eventsHash: canonicalGameCommandPayloadHash([]),
        reason: persistedReason,
      });
      revisionId = created.revisionId;
      revisionState = created.revisionState;
      version = created.version;
    }

    if (revisionState === 'DRAFT') {
      const submitCommandId = `${commandPrefix}:submit`;
      const submitted = await this.games.submitResultRevision(user, gameId, revisionId, submitCommandId, {
        expectedVersion: version,
        clientCommandId: submitCommandId,
      });
      revisionState = submitted.revisionState;
      version = submitted.version;
    }

    if (revisionState === 'SUBMITTED') {
      const decideCommandId = `${commandPrefix}:decide`;
      const decided = await this.games.decideResultRevision(user, gameId, revisionId, decideCommandId, {
        expectedVersion: version,
        clientCommandId: decideCommandId,
        decision: 'approve',
        reason: persistedReason,
      });
      revisionState = decided.revisionState;
      version = decided.version;
    }

    await this.adminContext.logAdminAction(admin, {
      action: 'league_match.record_result',
      targetType: 'team_match',
      targetId: teamMatchId,
      reason: dto.reason,
      fromStatus: teamMatch.status,
      toStatus: 'completed',
      afterJson: {
        leagueId,
        gameId,
        homeScore: dto.homeScore,
        awayScore: dto.awayScore,
        resultRevisionId: revisionId,
      },
    });

    return {
      teamMatchId,
      leagueId,
      homeScore: dto.homeScore,
      awayScore: dto.awayScore,
      resultRevisionId: revisionId,
      alreadyProcessed: false,
    };
  }

  // ─── 정정 ──────────────────────────────────────────────────────────────────

  private async correctResultOnce(
    user: V1AuthUser,
    leagueId: string,
    teamMatchId: string,
    dto: RecordLeagueResultDto,
  ) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const teamMatch = await this.loadMatchedFixture(leagueId, teamMatchId);
    const gameId = teamMatch.gameId;
    const persistedReason = `${RESULT_CORRECTION_REASON_MARKER} ${dto.reason.trim()}`;

    const latestRevision = await this.prisma.v1GameResultRevision.findFirst({
      where: { gameId },
      orderBy: { revision: 'desc' },
      select: { id: true, revision: true, state: true, reason: true, score: true },
    });
    if (latestRevision === null) {
      throw new ConflictException({
        code: 'LEAGUE_FIXTURE_RESULT_NOT_OFFICIAL',
        message: '정정할 공식 결과가 없어요. 먼저 결과를 입력해 주세요.',
      });
    }
    const isOurCorrection = latestRevision.reason?.startsWith(RESULT_CORRECTION_REASON_MARKER) ?? false;

    if (latestRevision.state === 'OFFICIAL') {
      const stored = parseStoredScore(latestRevision.score);
      const alreadyMatches =
        stored !== null &&
        stored.home === dto.homeScore &&
        stored.away === dto.awayScore &&
        latestRevision.reason === persistedReason;
      if (alreadyMatches) {
        return {
          teamMatchId,
          leagueId,
          homeScore: stored.home,
          awayScore: stored.away,
          resultRevisionId: latestRevision.id,
          alreadyProcessed: true,
        };
      }
      // 저장된 값과 다르다 -- 아래 공통 경로로 이어져 새로운 정정을 만든다.
    } else {
      // 직전 정정 시도가 create(DRAFT) 직후 officialize 전에 끊긴 경우에만 재개한다.
      // 우리가 만들지 않은 DRAFT(다른 조작이 진행 중)라면 충돌로 막는다.
      const resumable = isOurCorrection && latestRevision.state === 'DRAFT';
      if (!resumable) {
        throw new ConflictException({
          code: 'LEAGUE_FIXTURE_RESULT_IN_PROGRESS',
          message: '이미 처리 중이거나 정정할 수 없는 상태의 결과가 있어요.',
        });
      }
      return this.officializeDanglingCorrection(admin, user, gameId, leagueId, teamMatchId, latestRevision.id);
    }

    const attempt = latestRevision.revision + 1;
    const commandPrefix = `league-result-correction:${gameId}:${attempt}`;

    const createCommandId = `${commandPrefix}:create`;
    const created = await this.games.createTeamMatchResultCorrection(user, gameId, createCommandId, {
      expectedVersion: teamMatch.gameVersion,
      clientCommandId: createCommandId,
      score: { home: dto.homeScore, away: dto.awayScore },
      // 정정도 신규 입력과 같은 계약으로 선수별 득점·도움(선택)을 받는다. 멱등 판정은
      // 스코어·사유만 비교하므로, 같은 스코어·사유에 참가자만 바꾼 재요청은 no-op 이
      // 된다 — 참가자만 고치려면 사유를 바꿔 보내야 한다(정정 사유가 달라지는 것이
      // 감사 로그 관점에서도 맞다).
      actualParticipants: await this.resolveActualParticipants(gameId, dto),
      eventsHash: canonicalGameCommandPayloadHash([]),
      reason: persistedReason,
    });

    const officializeCommandId = `${commandPrefix}:officialize`;
    const officialized = await this.games.officializeTeamMatchResultCorrection(
      user,
      gameId,
      created.revisionId,
      officializeCommandId,
      { expectedVersion: created.version, clientCommandId: officializeCommandId },
    );

    await this.adminContext.logAdminAction(admin, {
      action: 'league_match.correct_result',
      targetType: 'team_match',
      targetId: teamMatchId,
      reason: dto.reason,
      afterJson: {
        leagueId,
        gameId,
        homeScore: dto.homeScore,
        awayScore: dto.awayScore,
        resultRevisionId: officialized.revisionId,
      },
    });

    return {
      teamMatchId,
      leagueId,
      homeScore: dto.homeScore,
      awayScore: dto.awayScore,
      resultRevisionId: officialized.revisionId,
      alreadyProcessed: false,
    };
  }

  /** correctResultOnce 의 resumable 분기: 이미 만들어진 DRAFT 정정을 officialize 만 이어서 수행한다. */
  private async officializeDanglingCorrection(
    admin: V1ActiveAdmin,
    user: V1AuthUser,
    gameId: string,
    leagueId: string,
    teamMatchId: string,
    revisionId: string,
  ) {
    const [game, revision] = await Promise.all([
      this.prisma.v1Game.findUniqueOrThrow({ where: { id: gameId }, select: { version: true } }),
      this.prisma.v1GameResultRevision.findUniqueOrThrow({
        where: { id: revisionId },
        select: { score: true, reason: true },
      }),
    ]);
    const officializeCommandId = `league-result-correction:${gameId}:resume:${revisionId}`;
    const officialized = await this.games.officializeTeamMatchResultCorrection(
      user,
      gameId,
      revisionId,
      officializeCommandId,
      { expectedVersion: game.version, clientCommandId: officializeCommandId },
    );
    const stored = parseStoredScore(revision.score);
    await this.adminContext.logAdminAction(admin, {
      action: 'league_match.correct_result',
      targetType: 'team_match',
      targetId: teamMatchId,
      reason: revision.reason ?? '',
      afterJson: { leagueId, gameId, resultRevisionId: officialized.revisionId, resumed: true },
    });
    return {
      teamMatchId,
      leagueId,
      homeScore: stored?.home ?? 0,
      awayScore: stored?.away ?? 0,
      resultRevisionId: officialized.revisionId,
      alreadyProcessed: false,
    };
  }
}
