import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AdminContextService, type V1ActiveAdmin } from '../common/admin-context.service';
import { canonicalGameCommandPayloadHash, GamesService } from '../games/games.service';
import { selectLatestLineupParticipants } from '../games/core/latest-lineup-participants';
import { PrismaService } from '../prisma/prisma.service';
import { parseLineupCatalog } from '../tournaments/competition-config/competition-config.parse';
import { V1AuthUser } from '../auth/v1-auth-user';
import { RecordLeagueResultDto } from './dto/league-match-result-entry.dto';
import { buildLeagueGoalEventSnapshot } from './league-goal-event-snapshot';
import { FORFEIT_REASON_MARKER } from './league-match-forfeit.service';
import { parseStoredScore } from './league-lifecycle-rules';
import {
  assembleLeagueResultParticipants,
  carryForwardResultParticipants,
  type AssembledResultParticipant,
  type LeagueSideRoster,
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
 *
 * ## 몰수 표식 승계 (감사 L-E finding 4 수정)
 * 정정 대상 대진이 몰수(forfeit)로 확정돼 있었다면, 정정은 별다른 지정이 없는 한
 * 그 표식을 그대로 이어받는다 -- `RecordLeagueResultDto.isForfeit` docblock이 계약을
 * 정의한다. 판정·저장은 `V1GameResultRevision.outcomeReason` 컬럼으로 하고(과거
 * 문자열 마커 시절 리비전은 fallback으로만 인정), 운영자가 명시적으로 `isForfeit`을
 * 보내면 승계 대신 그 값을 따른다 -- 몰수팀을 반대로 지정한 오류를 정정으로 바로잡을
 * 때 표식을 강제로 남기지 않기 위해서다.
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

/**
 * `v1_block_terminal_revision_mutation` 트리거가 던지는 SQLSTATE 55000 인가.
 *
 * Prisma 에는 트리거가 올린 SQLSTATE 를 타입으로 노출하는 표면이 없어(일반 CRUD 호출은
 * `PrismaClientUnknownRequestError` 로 감싸 메시지에만 담는다) 코드와 문구를 함께 본다.
 * 이 판정은 `snapshotGoalEvents` 의 `v1_game_result_revisions` 갱신 한 줄에만 씌우므로,
 * 그 자리에서 나올 수 있는 55000 은 "이 리비전은 더 이상 고칠 수 없다" 하나뿐이다.
 */
function isTerminalRevisionTriggerError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.message.includes('55000') || error.message.includes('terminal result revisions are immutable');
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
   * U1 모달의 득점자 선택 목록. 읽기 전용이라 getActiveAdmin 게이트를 쓴다
   * (league-match-dispute.service.listDisputes 와 동일).
   *
   * **사이드별 최신 라인업 리비전의 참가자만 돌려준다.** 예전에는 `where: { gameId }` 로
   * 모든 `V1GameParticipant` 를 읽었는데, 이 저장소는 그 행을 **한 번도 삭제하지 않고**
   * 라인업을 저장할 때마다 새 리비전에 새 행을 쌓는다(team-match-lineup.service.ts).
   * 그래서 라인업을 두 번 저장한 팀은 같은 선수가 드롭다운에 3번 뜬다(알파 실측:
   * 14명 → 21명 → 28명). 같은 데이터를 읽는 공개 기록 프로젝션과 공식 결과 스냅샷은
   * 이미 `selectLatestLineupParticipants` 로 최신 리비전만 고르고 있었고 이 경로만 빠져 있었다.
   *
   * **단, 현재 공식 기록이 있는 참가자는 최신 리비전 밖이더라도 남긴다.** 정정 모달은
   * `currentStats` 의 participantId 를 이 목록에서 찾아 이름을 붙이고, 못 찾으면 그 행을
   * **조용히 버린다**(league-result-entry-modal.tsx 의 프리필 `if (found === undefined)
   * return []`). 즉 목록에서 빠지는 순간 정정 한 번에 그 선수의 개인 기록이 사라진다 —
   * #748 에서 이미 한 번 겪은 사고다.
   *
   * **그 승계가 같은 이름을 두 줄로 만들지 않게 기록을 최신 행으로 옮겨 싣는다.** 옛
   * 리비전 행과 최신 행은 같은 사람인데 participantId 만 다르므로, 둘 다 실으면 운영자는
   * 드롭다운에서 '김선수'를 두 번 보고 어느 쪽이 최신 명단인지 알 수 없다. 그래서 옛 행의
   * 기록을 **같은 사이드·같은 `userId` 의 최신 행 id 로 다시 키를 매겨 합치고**(득점·도움
   * 합산) 옛 행은 목록에서 뺀다. 기록은 그대로 프리필되고(소실 없음) 이후 저장도 최신 행
   * 하나로 모인다 — 저장 쪽의 같은 규칙은 league-result-participants.ts 의
   * `foldDuplicateIdentities` 다.
   *
   * 최신 행으로 옮길 수 없는 기록(게스트라 `userId` 가 없거나, 그 사람이 최신 명단에서
   * 아예 빠진 경우)만 옛 행 그대로 남는데, 그때는 이름 뒤에 `(이전 명단)` 을 붙여 운영자가
   * 구분할 수 있게 한다 — 응답에 새 필드를 넣어도 지금 화면은 읽지 않으므로(프론트 계약
   * 변경 없이) 실제로 보이는 라벨에 담는다.
   */
  async listFixtureParticipants(user: V1AuthUser, leagueId: string, teamMatchId: string) {
    await this.adminContext.getActiveAdmin(user.id);
    const fixture = await this.loadMatchedFixture(leagueId, teamMatchId);
    const [sides, participants, lineups, game] = await Promise.all([
      this.prisma.v1GameSide.findMany({
        where: { gameId: fixture.gameId },
        select: { id: true, sideKey: true, displayNameSnapshot: true },
      }),
      this.prisma.v1GameParticipant.findMany({
        where: { gameId: fixture.gameId },
        select: { id: true, sideId: true, lineupId: true, displayNameSnapshot: true, userId: true },
        orderBy: { displayNameSnapshot: 'asc' },
      }),
      this.prisma.v1GameLineup.findMany({
        where: { gameId: fixture.gameId },
        select: { id: true, sideId: true, revision: true },
      }),
      this.prisma.v1Game.findUnique({
        where: { id: fixture.gameId },
        select: { currentOfficialRevisionId: true },
      }),
    ]);
    // 정정 모달이 기존 기록을 미리 채우는 데 쓴다 — 빈 화면이 "기록 없음"으로 오독돼
    // 정정 한 번에 개인 기록이 지워지는 사고를 막는다. 기록이 있는 행만 싣는다
    // (출전만 기록된 0-0 행까지 프리필하면 득점자 입력칸이 로스터 전체로 불어난다).
    const storedStats =
      game?.currentOfficialRevisionId == null
        ? []
        : await this.prisma.v1GameResultParticipant.findMany({
            where: {
              resultRevisionId: game.currentOfficialRevisionId,
              OR: [{ goals: { gt: 0 } }, { assists: { gt: 0 } }],
            },
            select: { participantId: true, goals: true, assists: true },
          });

    const latestRows = selectLatestLineupParticipants(participants, lineups);
    const latestIds = new Set(latestRows.map((row) => row.id));
    // 같은 사이드·같은 사용자의 최신 행. `userId` 가 없는 게스트는 동일인 판정 근거가
    // 없으므로(이름은 동명이인을 구분하지 못한다) 아예 넣지 않는다.
    const latestIdByIdentity = new Map<string, string>();
    for (const row of latestRows) {
      if (row.userId == null) continue;
      latestIdByIdentity.set(`${row.sideId}:${row.userId}`, row.id);
    }
    const participantById = new Map(participants.map((row) => [row.id, row]));
    const canonicalIdOf = (participantId: string): string => {
      const row = participantById.get(participantId);
      if (row === undefined || row.userId == null) return participantId;
      return latestIdByIdentity.get(`${row.sideId}:${row.userId}`) ?? participantId;
    };

    // 옛 행의 기록을 최신 행 id 로 옮겨 합친다. 같은 사람에게 두 행이 걸려 있던 경기
    // (수정 전 드롭다운 중복 시절)는 여기서 한 줄로 접힌다.
    const mergedStats = new Map<string, { participantId: string; goals: number; assists: number }>();
    for (const stat of storedStats) {
      const participantId = canonicalIdOf(stat.participantId);
      const current = mergedStats.get(participantId);
      mergedStats.set(participantId, {
        participantId,
        goals: (current?.goals ?? 0) + stat.goals,
        assists: (current?.assists ?? 0) + stat.assists,
      });
    }
    const currentStats = [...mergedStats.values()];
    const recordedIds = new Set(currentStats.map((row) => row.participantId));

    // participants 는 참가자 행 하나당 한 번씩만 나오므로 이 필터 뒤에도 participantId 중복은 없다.
    const selectable = participants.filter((row) => latestIds.has(row.id) || recordedIds.has(row.id));
    const bySide = (sideKey: 'HOME' | 'AWAY') => {
      const side = sides.find((row) => row.sideKey === sideKey);
      return {
        teamName: side?.displayNameSnapshot ?? (sideKey === 'HOME' ? '홈 팀' : '원정 팀'),
        players:
          side === undefined
            ? []
            : selectable
                .filter((row) => row.sideId === side.id)
                .map((row) => ({
                  participantId: row.id,
                  name: latestIds.has(row.id)
                    ? row.displayNameSnapshot
                    : `${row.displayNameSnapshot} (이전 명단)`,
                })),
      };
    };
    return { leagueId, teamMatchId, home: bySide('HOME'), away: bySide('AWAY'), currentStats };
  }

  /**
   * 사이드별 "최신 라인업 참가자 + 팀이 실제로 작성한 라인업인가" 를 모은다.
   * 출전 기록(`V1GameResultParticipant` 행)과 started/goalkeeper 판정의 유일한 근거다 —
   * 규칙 자체는 league-result-participants.ts 의 docblock 참고.
   *
   * **`teamAuthored` 판정**: 대진 생성이 만드는 자동 로스터는 정확히
   * `revision === 1 && supersedesId === null` 한 종류다(GamesService.createFromSourceInTransaction
   * 이 사이드마다 `{ revision: 1 }` 만 넣고 supersedesId 를 채우지 않는다). 팀이 저장·재작성한
   * 라인업은 전부 `revision: previous.revision + 1` + `supersedesId: previous.id` 로 만들어지므로
   * (team-match-lineup.service.ts 의 saveLineup/requestChange), 그 자동 로스터 모양을 **부정**하는
   * 것이 가장 좁고 정확한 판정이다. `lineup.state` 는 쓸 수 없다 — 자동 로스터도 경기 시작이
   * 지나면 lazyLock 대상이 되고 DRAFT/LOCKED 만으로는 누가 썼는지 구분되지 않는다. 두 조건이
   * 어긋나는 방향(예: 자동 로스터 없이 팀이 revision 1 을 만든 경우)에서는 "작성 안 함"으로
   * 접혀 출전 기록을 만들지 않는다 — 허위 출전보다 미기록이 안전한 쪽이다.
   */
  private async loadSideRosters(gameId: string): Promise<{
    rosters: LeagueSideRoster[];
    goalkeeperPositionCode: string;
    userIdByParticipantId: Map<string, string | null>;
    hasGameEvents: boolean;
  }> {
    const [lineups, participants, game, eventCount] = await Promise.all([
      this.prisma.v1GameLineup.findMany({
        where: { gameId },
        select: { id: true, sideId: true, revision: true, supersedesId: true },
      }),
      this.prisma.v1GameParticipant.findMany({
        where: { gameId },
        // 라인업이 저장한 순서를 그대로 유지한다(선발 → 후보) — 결과 리비전 행 순서가
        // 매 요청 흔들리지 않게 하려는 것이다.
        orderBy: { createdAt: 'asc' },
        // userId 는 최신 리비전 밖의 행까지 포함해 전부 읽는다 — 옛 라인업 행에 달린
        // 기록을 같은 사람의 최신 행으로 접으려면(league-result-participants.ts
        // foldDuplicateIdentities) 로스터 밖 행의 신원도 알아야 한다.
        select: { id: true, sideId: true, lineupId: true, position: true, userId: true },
      }),
      this.prisma.v1Game.findUniqueOrThrow({
        where: { id: gameId },
        select: { competitionConfig: { select: { lineup: true } } },
      }),
      // `validateGameResultInvariants` 의 TEAM_MATCH 면제와 **같은 조건**(행이 0건인가)을
      // 본다 — 되돌린 이벤트·CORRECTION 행도 그 면제에서는 이벤트로 세므로 여기서도 뺀다.
      this.prisma.v1GameEvent.count({ where: { gameId } }),
    ]);

    const latestLineupBySideId = new Map<string, { revision: number; supersedesId: string | null }>();
    for (const lineup of lineups) {
      const current = latestLineupBySideId.get(lineup.sideId);
      if (current === undefined || lineup.revision > current.revision) {
        latestLineupBySideId.set(lineup.sideId, {
          revision: lineup.revision,
          supersedesId: lineup.supersedesId,
        });
      }
    }
    const bySideId = new Map<string, { id: string; sideId: string; position: string | null }[]>();
    for (const participant of selectLatestLineupParticipants(participants, lineups)) {
      const rows = bySideId.get(participant.sideId) ?? [];
      rows.push({ id: participant.id, sideId: participant.sideId, position: participant.position });
      bySideId.set(participant.sideId, rows);
    }

    const rosters: LeagueSideRoster[] = [...latestLineupBySideId.entries()].map(([sideId, lineup]) => ({
      sideId,
      teamAuthored: !(lineup.revision === 1 && lineup.supersedesId === null),
      participants: bySideId.get(sideId) ?? [],
    }));
    // 종목별 골키퍼 코드(축구 'GK', 풋살 'GOLEIRO'). 사전에 표시가 없는 레거시 config 는
    // games.service.ts·team-lineup-history.service.ts 와 같은 관례로 'GK' 폴백.
    const goalkeeperPositionCode =
      parseLineupCatalog(game.competitionConfig.lineup).positions.find(
        (position) => position.goalkeeper === true,
      )?.code ?? 'GK';
    return {
      rosters,
      goalkeeperPositionCode,
      userIdByParticipantId: new Map(participants.map((row) => [row.id, row.userId])),
      hasGameEvents: eventCount > 0,
    };
  }

  /**
   * 정정에서 participants 미전송 시: 직전 공식 리비전의 개인 기록을 승계하고, 팀이 작성한
   * 라인업이 있는 사이드는 출전 기록도 함께 채운다. 규칙(스코어 하향 정정과의 충돌 검증,
   * 로스터 보강 범위)은 순수 모듈이 수행한다.
   */
  private async carryForwardFromRevision(
    gameId: string,
    revisionId: string,
    dto: RecordLeagueResultDto,
  ): Promise<AssembledResultParticipant[]> {
    const [rows, sides, roster] = await Promise.all([
      this.prisma.v1GameResultParticipant.findMany({
        where: { resultRevisionId: revisionId },
        select: {
          participantId: true,
          sideId: true,
          started: true,
          minutesPlayed: true,
          goals: true,
          assists: true,
          fouls: true,
          cards: true,
          goalkeeper: true,
        },
      }),
      this.prisma.v1GameSide.findMany({ where: { gameId }, select: { id: true, sideKey: true } }),
      this.loadSideRosters(gameId),
    ]);
    const result = carryForwardResultParticipants({
      rows,
      sides: sides.map((side) => ({ id: side.id, sideKey: side.sideKey as 'HOME' | 'AWAY' })),
      rosters: roster.rosters,
      goalkeeperPositionCode: roster.goalkeeperPositionCode,
      userIdByParticipantId: roster.userIdByParticipantId,
      hasGameEvents: roster.hasGameEvents,
      homeScore: dto.homeScore,
      awayScore: dto.awayScore,
    });
    if (!result.ok) {
      throw new BadRequestException({ code: result.code, message: result.message });
    }
    return result.actualParticipants;
  }

  /**
   * dto.participants(선택)를 GamesService 가 받는 actualParticipants 로 변환한다.
   * 검증(이 게임 소속·중복·사이드별 합 ≤ 스코어)과 출전 기록 규칙은 순수 모듈
   * league-result-participants.ts 가 수행하고, 여기서는 조회와 예외 변환만 한다.
   *
   * **`participants` 를 안 보냈어도 로스터는 읽는다.** 스코어만 확정하는 입력에서도 팀이
   * 라인업을 작성했다면 그 경기의 출전 기록은 남아야 한다 — 예전에는 여기서 곧장 `[]` 를
   * 돌려줘서 득점자를 적지 않은 경기가 개인 전적에 아예 존재하지 않았다. 명시적 `[]` 도
   * 같은 경로를 타며 "득점·도움 전부 0, 출전 기록은 유지"로 저장된다(순수 모듈 docblock).
   */
  private async resolveActualParticipants(
    gameId: string,
    dto: RecordLeagueResultDto,
  ): Promise<AssembledResultParticipant[]> {
    // `?? []`: undefined 뿐 아니라 **명시적 null** 도 흡수해야 한다 — @IsOptional() 은 null 을
    // 검증 없이 통과시키므로 undefined 만 걸러서는 `null.length` 500 이 난다(Copilot 리뷰).
    const stats = dto.participants ?? [];
    const [gameParticipants, sides, roster] = await Promise.all([
      stats.length === 0
        ? Promise.resolve([])
        : this.prisma.v1GameParticipant.findMany({
            where: { gameId, id: { in: stats.map((stat) => stat.participantId) } },
            select: { id: true, sideId: true },
          }),
      this.prisma.v1GameSide.findMany({ where: { gameId }, select: { id: true, sideKey: true } }),
      this.loadSideRosters(gameId),
    ]);
    const result = assembleLeagueResultParticipants({
      participants: stats,
      gameParticipants,
      sides: sides.map((side) => ({ id: side.id, sideKey: side.sideKey as 'HOME' | 'AWAY' })),
      rosters: roster.rosters,
      goalkeeperPositionCode: roster.goalkeeperPositionCode,
      userIdByParticipantId: roster.userIdByParticipantId,
      hasGameEvents: roster.hasGameEvents,
      homeScore: dto.homeScore,
      awayScore: dto.awayScore,
    });
    if (!result.ok) {
      throw new BadRequestException({ code: result.code, message: result.message });
    }
    return result.actualParticipants;
  }

  /**
   * 확정 직전의 DRAFT/SUBMITTED 리비전에 득점 스냅샷(`goalEvents`)을 박는다.
   *
   * **왜 여기서 직접 쓰는가**: 공개 경기 기록의 "경기 기록" 타임라인은 라이브 이벤트 행이
   * 없는 경기에서는 공식 리비전의 `goalEvents` JSON 만 읽는데(games/public-records/
   * public-tournament-records.service.ts `buildEvents`), 리그가 쓰는
   * `GamesService.createResultRevision`/`createTeamMatchResultCorrection` 의 입력
   * (`CreateGameResultRevisionDto`)에는 **`goalEvents` 칸 자체가 없다** — 그 스냅샷은 지금까지
   * 대회 종료 커맨드(`deriveTournamentRevision`)만 만들었다. 그래서 운영자가 득점자를 입력해도
   * 리그 경기 기록은 "기록된 이벤트가 없어요"로 남았다(알파 실측). 구조적으로 맞는 자리는
   * 그 DTO 와 games.service.ts 지만 그 파일은 이 변경의 소유 범위가 아니라, 리그 레인에서
   * 방금 만든 리비전에만 스냅샷을 얹는다.
   *
   * 안전성: `v1_block_terminal_revision_mutation` 트리거는 DRAFT 리비전의 갱신을 허용하고
   * (SUBMITTED 도 `goal_events` 는 동결 컬럼 목록에 없다) terminal 상태
   * (CHANGE_REQUESTED/SUPPLEMENT_REQUESTED/REJECTED/OFFICIAL/VOID)에서만 잠근다. 그래서
   * 이 쓰기는 반드시 submit/officialize **앞에** 있어야 한다. 결정적(deterministic) 값이라
   * 같은 요청을 재시도해도 같은 스냅샷이 다시 쓰인다.
   *
   * **이 쓰기는 GamesService.withCommand 의 낙관적 락 밖이다.** 끊긴 시도를 재개하는 두
   * 요청이 겹치면 앞선 요청이 그 사이에 리비전을 OFFICIAL 로 만들 수 있고, 그때 트리거가
   * SQLSTATE 55000 을 던진다 — 그냥 두면 Prisma raw 에러가 그대로 올라가 **500** 이 된다.
   * 그래서 ① 상태 가드가 걸린 `updateMany` 로 쓰고(READ COMMITTED 에서 갱신 시점의 상태를
   * 다시 평가하므로 0건이면 그 사이 확정된 것) ② 그래도 빠져나가는 경합을 위해 55000 을
   * 도메인 409 로 옮긴다. 이 수정 전에 뒤늦은 요청이 받던 깨끗한 409(다음 decide 단계가
   * 던지던 것)와 같은 결과다.
   *
   * 득점이 하나도 없으면 아무것도 쓰지 않는다 — `buildEvents` 는 `goalEvents` 가 배열이기만
   * 하면 이벤트 레인을 통째로 대체하므로, 빈 배열을 저장하면 (운영자가 붙였을 수 있는)
   * 실제 골 이벤트까지 화면에서 가려진다. 같은 이유로 **이 게임에 이벤트 행이 있으면 아예
   * 쓰지 않는다** — 이벤트 레인에는 분·전후반이 있는데 이 스냅샷에는 없어서, 덮는 순간
   * 공개 타임라인이 더 빈약해진다(이벤트가 있는 경기는 이벤트가 권위라는
   * league-result-participants.ts 의 `hasGameEvents` 규칙과 같은 판단이다).
   */
  private async snapshotGoalEvents(gameId: string, revisionId: string): Promise<void> {
    const [stored, eventCount] = await Promise.all([
      this.prisma.v1GameResultParticipant.findMany({
        where: { resultRevisionId: revisionId },
        select: { participantId: true, sideId: true, goals: true },
      }),
      this.prisma.v1GameEvent.count({ where: { gameId } }),
    ]);
    if (eventCount > 0) return;
    const goalEvents = buildLeagueGoalEventSnapshot(stored);
    if (goalEvents.length === 0) return;
    const finalized = new ConflictException({
      code: 'LEAGUE_FIXTURE_RESULT_REVISION_FINALIZED',
      message: '다른 요청이 이 결과를 먼저 확정했어요. 새로고침한 뒤 현재 결과를 확인해 주세요.',
    });
    let updated: { count: number };
    try {
      updated = await this.prisma.v1GameResultRevision.updateMany({
        where: { id: revisionId, state: { in: ['DRAFT', 'SUBMITTED'] } },
        data: { goalEvents: goalEvents as unknown as Prisma.InputJsonValue },
      });
    } catch (error) {
      if (!isTerminalRevisionTriggerError(error)) throw error;
      throw finalized;
    }
    if (updated.count === 0) throw finalized;
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
    // 감사 L-E finding 2 수정: VOID(이의 수락으로 무효 처리된 결과)도 CHANGE_REQUESTED와
    // 마찬가지로 새 신규 입력을 받아들인다 -- games.service.ts의 createResultRevision이
    // 이제 VOID predecessor를 허용하는 것과 짝을 이루는 게이트다. 이걸 막아 두면 무효
    // 처리된 대진은 순위표·완료 판정에서 미확정으로도, 확정으로도 정리되지 못한 채
    // 재입력 자체가 영구히 막혀 그 시즌 승강 확정이 교착됐다.
    if (
      latestRevision !== null &&
      latestRevision.state !== 'CHANGE_REQUESTED' &&
      latestRevision.state !== 'VOID' &&
      !resumable
    ) {
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
        // 선수별 득점·도움 + 팀이 작성한 라인업이 있으면 그 사이드의 출전자 전원.
        // `V1GameEvent` 행은 계속 만들지 않는다 — TEAM_MATCH 무이벤트 면제
        // (game-invariants.ts Task 17 Option A)가 참가자 합계를 권위로 받아 준다.
        // (공개 타임라인용 goalEvents 스냅샷은 이벤트 행이 아니라 리비전의 JSON 칸이다 —
        //  아래 snapshotGoalEvents 참고.)
        actualParticipants: await this.resolveActualParticipants(gameId, dto),
        eventsHash: canonicalGameCommandPayloadHash([]),
        reason: persistedReason,
      });
      revisionId = created.revisionId;
      revisionState = created.revisionState;
      version = created.version;
    }

    // OFFICIAL 로 잠기기 전에 득점 스냅샷을 남긴다(위 snapshotGoalEvents docblock 참고).
    // 재개(resumable) 분기도 함께 지난다 — 직전 시도가 create 직후에 끊겼다면 스냅샷만
    // 빠진 리비전이 남아 있을 수 있다.
    await this.snapshotGoalEvents(gameId, revisionId);

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

    const latestRevision = await this.prisma.v1GameResultRevision.findFirst({
      where: { gameId },
      orderBy: { revision: 'desc' },
      select: { id: true, revision: true, state: true, reason: true, score: true, outcomeReason: true },
    });
    if (latestRevision === null) {
      throw new ConflictException({
        code: 'LEAGUE_FIXTURE_RESULT_NOT_OFFICIAL',
        message: '정정할 공식 결과가 없어요. 먼저 결과를 입력해 주세요.',
      });
    }
    // 감사 L-E finding 4 수정(2단계) -- 판정 근거를 문자열 접두어에서 전용 컬럼
    // `outcomeReason`으로 옮겼다. base(직전) 리비전이 몰수인지는 컬럼을 1차로 보고,
    // 컬럼이 생기기 전에 만들어진 옛 리비전(문자열 마커만 갖고 있음)은 `.includes`로
    // 함께 인정한다 -- `startsWith`만 보면 정정을 한 번만 거쳐도(마커가 맨 앞이 아니게
    // 되면) 놓친다.
    const baseWasForfeit =
      latestRevision.outcomeReason === 'FORFEIT' ||
      (latestRevision.reason?.includes(FORFEIT_REASON_MARKER) ?? false);
    // 운영자가 이번 정정의 몰수 여부를 명시하면 그 값을 따르고(몰수 아님으로 되돌리는
    // 것도 포함), 미지정이면 base를 승계한다 -- RecordLeagueResultDto.isForfeit docblock의
    // 계약. 이의(dispute) 수락 경로(league-match-dispute.service.ts)는 이 필드를 보내지
    // 않으므로 항상 승계로 떨어져, 정당한 몰수 경기의 이의를 정정으로 처리해도 표식이
    // 사라지지 않는다.
    const effectiveIsForfeit = dto.isForfeit ?? baseWasForfeit;
    const outcome = effectiveIsForfeit
      ? ({ outcomeReason: 'FORFEIT', note: dto.reason.trim() } as const)
      : ({ outcomeReason: 'NORMAL', note: null } as const);
    // reason 문자열의 마커는 이제 판정 근거가 아니라 컬럼이 생기기 전 레거시 리비전을
    // 위한 fallback 입력일 뿐이지만, 감사 로그 가독성과 하위 호환을 위해 계속 남긴다.
    const persistedReason = effectiveIsForfeit
      ? `${RESULT_CORRECTION_REASON_MARKER} ${FORFEIT_REASON_MARKER} ${dto.reason.trim()}`
      : `${RESULT_CORRECTION_REASON_MARKER} ${dto.reason.trim()}`;
    const isOurCorrection = latestRevision.reason?.startsWith(RESULT_CORRECTION_REASON_MARKER) ?? false;

    if (latestRevision.state === 'OFFICIAL') {
      const stored = parseStoredScore(latestRevision.score);
      const alreadyMatches =
        stored !== null &&
        stored.home === dto.homeScore &&
        stored.away === dto.awayScore &&
        latestRevision.reason === persistedReason &&
        latestRevision.outcomeReason === outcome.outcomeReason;
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

    // 정정의 participants 계약(Copilot 리뷰 반영 — 미전송 정정이 기존 개인 기록을
    // 소실시키던 구멍): **미전송(null/undefined) = 직전 공식 기록 승계, 명시적 [] = 득점·도움
    // 전부 비움, 전송 = 교체.** `[]` 는 "출전 기록까지 삭제"가 아니다 — 출전은 팀이 작성한
    // 라인업에서 나오고 이 배열은 득점·도움만 담는다(league-result-participants.ts 의
    // assembleLeagueResultParticipants docblock). 멱등 판정은 스코어·사유만 비교하므로,
    // 참가자만 고치려면 사유를 바꿔 보내야 한다(정정 사유가 달라지는 것이 감사 로그
    // 관점에서도 맞다).
    const actualParticipants =
      dto.participants == null
        ? await this.carryForwardFromRevision(gameId, latestRevision.id, dto)
        : await this.resolveActualParticipants(gameId, dto);

    const createCommandId = `${commandPrefix}:create`;
    const created = await this.games.createTeamMatchResultCorrection(
      user,
      gameId,
      createCommandId,
      {
        expectedVersion: teamMatch.gameVersion,
        clientCommandId: createCommandId,
        score: { home: dto.homeScore, away: dto.awayScore },
        actualParticipants,
        eventsHash: canonicalGameCommandPayloadHash([]),
        reason: persistedReason,
      },
      // 감사 L-E finding 4 수정(2단계): 판정 근거를 컬럼으로 옮긴 실제 쓰기 지점.
      outcome,
    );

    // 신규 입력과 같은 이유로 officialize 앞에서 득점 스냅샷을 남긴다 — 정정 리비전은
    // 새 행이라 직전 리비전의 goalEvents 를 물려받지 않는다.
    await this.snapshotGoalEvents(gameId, created.revisionId);

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
    // 끊겼던 정정 재개도 같은 스냅샷 계약을 지킨다 — DRAFT 인 지금이 마지막 기회다.
    await this.snapshotGoalEvents(gameId, revisionId);
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
