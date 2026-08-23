import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { AdminContextService } from '../common/admin-context.service';
import { canonicalGameCommandPayloadHash, GamesService } from '../games/games.service';
import { PrismaService } from '../prisma/prisma.service';
import { V1AuthUser } from '../auth/v1-auth-user';
import { RecordLeagueForfeitDto } from './dto/league-match-forfeit.dto';
import { resolveStoredForfeit } from './league-lifecycle-rules';

/**
 * R11(C-6) 몰수패·부전승 결과 입력 경로.
 *
 * ## 설계 배경 (레인 G 조사 결과 — Task 152)
 * `schema.prisma` 변경(신규 컬럼·enum 값)이 금지돼 있어 "이 결과는 몰수다"라는
 * 별도 상태를 저장할 새 자리가 없다. 대신 팀매치 결과 확정 파이프라인이 이미
 * 몰수를 표현할 수 있다는 사실을 조사로 확인했다:
 *
 *  - `GamesService.createResultRevision`이 거치는
 *    `validateGameResultInvariants`(games/core/game-invariants.ts)는 참가자
 *    0명(`actualParticipants: []`)을 허용한다 — 최소 인원 제약이 없다.
 *  - TEAM_MATCH 소스에 이벤트가 0건이면(`teamMatchWithoutEvents`,
 *    game-invariants.ts:206-216) 제출된 점수가 이벤트 교차검증 없이 그대로
 *    신뢰된다.
 *  - `resolveActor`는 TEAM_MATCH 게임에서 활성 비-support 어드민(platform_ops)에게
 *    모든 액션(team_result_submit / opponent_result_decide 포함)을 팀 소속과
 *    무관하게 즉시 허용한다(games.service.ts:4266-4272) — 어드민 혼자
 *    create -> submit -> decide(approve) 3단계를 전부 수행할 수 있다.
 *  - 대진의 게임이 `SCHEDULED`(한 번도 시작 안 함) 상태에서도 결과 제출로 바로
 *    `ENDED`로 전이할 수 있다(teamResultSubmittableStates, game-contract.ts:63-73).
 *
 * 즉 "몰수 결과 입력"은 새 메커니즘이 아니라, 기존 결과 확정 3단계
 * (create/submit/decide)를 어드민 권한으로 참가자 0명·이벤트 0건·고정 스코어로
 * 실행하는 것이다. 이 서비스는 그 3단계를 하나의 어드민 액션으로 감싼다. 세
 * 호출은 각자 자기 트랜잭션을 여는 `GamesService`의 기존 계약이라(withCommand),
 * 이 메서드 전체를 단일 트랜잭션으로 묶을 수는 없다 — 대신 중간에 끊겨도 안전하게
 * 재시도할 수 있도록 리비전 state를 보고 이어서 진행한다(아래 resumable 분기).
 *
 * ## 스코어 컨벤션
 * 승자 1 : 몰수팀 0 — 종목 불문 최소 마진을 고정값으로 쓴다. 몰수 스코어를
 * admin이 자유 입력하게 하면 이 액션이 임의의 공식 결과를 심는 우회 경로가 될 수
 * 있어 의도적으로 막았다. **트레이드오프**: 실제 대회 규정(예: 축구 3:0 몰수)과
 * 다를 수 있고, 골득실 등 리그 통계에 "1점"이라는 임의 마진이 섞인다 — 이후
 * 종목별 컨벤션이 필요해지면 재검토한다.
 *
 * ## 사유 필드 재사용 (신규 컬럼 없이 몰수를 표시하는 유일한 방법)
 * `V1GameResultRevision.reason`(이미 존재하는 자유 텍스트 컬럼)에
 * `FORFEIT_REASON_MARKER` 접두어를 붙여 저장한다. 이 마커가 "이 결과는 몰수다"의
 * 유일한 표식이라, 상수를 export 해 읽는 쪽과 **단일 출처**로 공유한다.
 *
 * 공개 상세(`league-match-public.service.ts`)는 이 접두어를 `isForfeit: boolean` 으로
 * 환산해 내보낸다 — 그래야 관전자가 몰수 결과를 실제 1:0 승리와 같은 경기로 읽지 않는다.
 * **사유 원문은 공개하지 않는다**: 운영자가 쓴 자유 텍스트라 그대로 노출하면 내부 메모가
 * 새어 나간다. 읽는 쪽은 boolean 만 만들고 문자열은 버려야 한다.
 */

// 공개 응답에서 몰수 여부를 판정하는 쪽(league-match-public.service.ts)도 같은 값을 봐야 한다.
// 문자열을 복제하면 한쪽만 바뀌었을 때 조용히 어긋나므로 여기가 단일 출처다.
export const FORFEIT_REASON_MARKER = '[LEAGUE_FORFEIT]';
const WINNER_SCORE = 1;
const LOSER_SCORE = 0;

@Injectable()
export class LeagueMatchForfeitService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminContext: AdminContextService,
    private readonly games: GamesService,
  ) {}

  async recordForfeit(user: V1AuthUser, leagueId: string, teamMatchId: string, dto: RecordLeagueForfeitDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);

    const teamMatch = await this.prisma.v1TeamMatch.findFirst({
      where: { id: teamMatchId, leagueId },
      select: {
        id: true,
        status: true,
        hostTeamId: true,
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
        message: '상대팀이 확정되지 않은 대진은 몰수 처리할 수 없어요.',
      });
    }
    if (teamMatch.status === 'cancelled') {
      throw new ConflictException({
        code: 'LEAGUE_FIXTURE_CANCELLED',
        message: '이미 취소된 대진은 몰수 처리할 수 없어요.',
      });
    }
    if (dto.noShowTeamId !== teamMatch.hostTeamId && dto.noShowTeamId !== teamMatch.approvedApplicantTeamId) {
      throw new UnprocessableEntityException({
        code: 'LEAGUE_FORFEIT_TEAM_INVALID',
        message: '이 대진에 속한 팀만 몰수 처리할 수 있어요.',
      });
    }

    // teamMatch.game은 위에서 이미 null 체크를 했지만, 아래에 await가 여러 번 끼어들어
    // TS의 property narrowing이 유지된다고 보장할 수 없다 — 지역 변수로 뽑아 고정한다.
    const gameId = teamMatch.game.id;
    const initialGameVersion = teamMatch.game.version;
    const isHostNoShow = dto.noShowTeamId === teamMatch.hostTeamId;
    const homeScore = isHostNoShow ? LOSER_SCORE : WINNER_SCORE;
    const awayScore = isHostNoShow ? WINNER_SCORE : LOSER_SCORE;
    const winningTeamId = isHostNoShow ? teamMatch.approvedApplicantTeamId : teamMatch.hostTeamId;
    const persistedReason = `${FORFEIT_REASON_MARKER} ${dto.reason.trim()}`;

    const latestRevision = await this.prisma.v1GameResultRevision.findFirst({
      where: { gameId },
      orderBy: { revision: 'desc' },
      select: { id: true, revision: true, state: true, reason: true, score: true },
    });
    const isOurForfeit = latestRevision?.reason?.startsWith(FORFEIT_REASON_MARKER) ?? false;

    if (latestRevision !== null && latestRevision.state === 'OFFICIAL') {
      if (isOurForfeit) {
        // 멱등 응답은 **저장된 리비전**을 그대로 되읽어 돌려준다. 요청 dto로 계산한 값을
        // 돌려주면 운영자가 몰수팀을 반대로 지정해 재호출했을 때 "0:1 · B팀 몰수, 처리
        // 완료"라는 응답을 받는데 DB에는 여전히 1:0 · A팀 몰수가 남는다 -- 잘못 넣은
        // 몰수를 고쳤다고 착각하게 만드는 거짓 성공이다(alpha 실측으로 재현됨).
        const outcome = resolveStoredForfeit({
          storedScore: latestRevision.score,
          hostTeamId: teamMatch.hostTeamId,
          awayTeamId: teamMatch.approvedApplicantTeamId,
          requestedNoShowTeamId: dto.noShowTeamId,
          fallback: { homeScore, awayScore },
        });
        return {
          teamMatchId,
          leagueId,
          ...outcome,
          resultRevisionId: latestRevision.id,
          alreadyProcessed: true,
        };
      }
      throw new ConflictException({
        code: 'LEAGUE_FIXTURE_RESULT_ALREADY_OFFICIAL',
        message: '이미 공식 결과가 확정된 대진이에요. 정정이 필요하면 결과 정정 절차를 이용해 주세요.',
      });
    }

    // 재시도 가능 지점: 직전 몰수 시도가 create(DRAFT)나 submit(SUBMITTED) 직후
    // decide 전에 끊긴 경우 -- 새 리비전을 또 만들지 않고 그 지점부터 이어간다.
    const resumable =
      latestRevision !== null &&
      isOurForfeit &&
      (latestRevision.state === 'DRAFT' || latestRevision.state === 'SUBMITTED');
    if (latestRevision !== null && latestRevision.state !== 'CHANGE_REQUESTED' && !resumable) {
      throw new ConflictException({
        code: 'LEAGUE_FIXTURE_RESULT_IN_PROGRESS',
        message: '이미 처리 중이거나 이력이 있는 결과가 있어 몰수 처리를 할 수 없어요.',
      });
    }

    // 커맨드 ID에 리비전 번호를 섞는다. gameId만으로 고정하면 CHANGE_REQUESTED 이후
    // 재몰수(이 서비스가 :159 주석에서 의도된 경로로 열어 둔 흐름)에서 첫 몰수가 이미
    // 쓴 idempotency 레코드에 부딪힌다 -- payload가 같으면 withCommand가 REPLAY로 옛
    // 응답을 돌려줘 새 리비전이 생기지 않는데 응답은 성공이고, payload가 다르면
    // IDEMPOTENCY_PAYLOAD_CONFLICT가 난다. 시도 차수를 키에 넣으면 두 경우 모두 사라지고,
    // 같은 차수 안에서의 재시도(resumable 경로)는 여전히 같은 키를 써 멱등을 유지한다.
    const attempt = (latestRevision?.revision ?? 0) + (resumable ? 0 : 1);
    const commandPrefix = `league-forfeit:${gameId}:${attempt}`;

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
      // 정상 경로(첫 시도) 또는 CHANGE_REQUESTED 이후 정정으로 몰수 처리하는 경우 —
      // createResultRevision 자체가 "최신 리비전이 없거나 CHANGE_REQUESTED여야
      // 새 DRAFT를 만들 수 있다"를 검증하므로(RESULT_REVISION_ALREADY_EXISTS),
      // 위의 사전 가드와 정확히 같은 조건에서만 이 분기에 도달한다.
      const createCommandId = `${commandPrefix}:create`;
      const created = await this.games.createResultRevision(user, gameId, createCommandId, {
        expectedVersion: initialGameVersion,
        clientCommandId: createCommandId,
        score: { home: homeScore, away: awayScore },
        actualParticipants: [],
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
      action: 'league_match.record_forfeit',
      targetType: 'team_match',
      targetId: teamMatchId,
      reason: dto.reason,
      fromStatus: teamMatch.status,
      toStatus: 'completed',
      afterJson: {
        leagueId,
        gameId,
        noShowTeamId: dto.noShowTeamId,
        winningTeamId,
        homeScore,
        awayScore,
        resultRevisionId: revisionId,
      },
    });

    return {
      teamMatchId,
      leagueId,
      noShowTeamId: dto.noShowTeamId,
      winningTeamId,
      homeScore,
      awayScore,
      resultRevisionId: revisionId,
      alreadyProcessed: false,
    };
  }
}
