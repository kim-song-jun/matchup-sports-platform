import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, V1ConsentState, V1GameLineupState, type V1GameLineup } from '@prisma/client';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { OperationAuditWriterService } from '../common/audit/operation-audit-writer.service';
import { canonicalGameCommandPayloadHash, createRosterAssertedIdentityLink } from '../games/games.service';
import { PrismaService } from '../prisma/prisma.service';
import { parseLineupCatalog, parseLineupConfigForResponse } from '../tournaments/competition-config/competition-config.parse';
import { findRejectedLineupPosition, rejectedLineupPositionMessage } from '../games/core/lineup-position';
import {
  ChangeRequestTeamMatchLineupDto,
  SaveTeamMatchLineupDto,
  SubmitTeamMatchLineupDto,
  TeamMatchLineupParticipantDto,
} from './dto/team-match-lineup.dto';

type Transaction = Prisma.TransactionClient;

/**
 * 선발 골키퍼를 표시하는 `V1GameParticipant.position` 센티널.
 * (`V1GameResultParticipant.goalkeeper` 가 암묵적으로 따르던 관례와 같다.)
 *
 * **종목과 무관하게 항상 이 리터럴**이다 — 대회 경기 라인업은 종목 사전의 코드를 그대로
 * 저장하는데(풋살은 `'GOLEIRO'`) 팀 매치는 `goalkeeper: true` 를 받아 여기서 눌러 담는다.
 * 그래서 읽는 쪽(`TeamLineupHistoryService`, `league-result-participants.ts`)은 팀 매치
 * 소스에 대해 사전 코드가 아니라 이 센티널과 비교해야 한다 — export 하는 이유다.
 *
 * ⚠️ 선발/후보를 나타내던 짝 센티널 `BENCH_MARKER('BENCH')` 는 **없앴다**(Task 163 BE-3).
 * 후보라는 개념 자체가 사라졌다 — 명단에 있으면 그 경기에 뛴 것이고 `started` 는 항상
 * true 다(정본 §3). 옛 행은 마이그레이션 `20260902000000_v1_lineup_bench_to_started` 가
 * 정리했다. 한 컬럼(position)이 소스에 따라 다른 뜻을 갖던 상태가 사라졌으므로
 * **다시 만들지 마라** — 읽는 쪽마다 소스별 분기를 복제하게 되고, 실제로 한 곳은 상수를
 * import 하지 않고 값을 복사해 갖고 있었다.
 */
export const GOALKEEPER_MARKER = 'GK';

/**
 * 저장 요청이 실은 명단 **하나**임을 한 곳에서 확정한다.
 *
 * 정본 §3 이 선발/후보 구분을 없앴으므로 `participants` 가 정본 형태이고,
 * `starters`/`bench` 는 프론트가 아직 보내는 옛 형태다 — 어느 쪽에 담겨 왔든 같은 명단이
 * 되고, **담긴 위치가 저장 결과를 바꾸지 않는다.** 세 배열을 각자 훑는 코드가 생기면 그
 * 순간 "어느 배열이었나" 가 다시 의미를 갖게 되므로 여기서만 편다.
 *
 * ⚠️ **합치지 않고 고른다.** 전환기의 클라이언트는 같은 명단을 두 모양으로 **함께** 보낼
 * 수 있는데(새 필드를 붙이면서 옛 필드를 아직 안 지운 배포), 무조건 이어 붙이면 같은
 * 사람이 두 번 실려 `LINEUP_DUPLICATE_PARTICIPANT` 로 400 이 난다 — 보내는 쪽은 아무것도
 * 잘못한 게 없는데 저장이 막힌다. `participants` 가 비어 있지 않으면 **그것만** 쓰고,
 * 없을 때만 옛 두 칸으로 돌아간다.
 */
function rosterOf(dto: SaveTeamMatchLineupDto): TeamMatchLineupParticipantDto[] {
  if (dto.participants !== undefined && dto.participants.length > 0) return dto.participants;
  return [...(dto.starters ?? []), ...(dto.bench ?? [])];
}

interface TeamMatchLineupContext {
  gameId: string;
  gameCompetitionConfigVersionId: string;
  teamMatchId: string;
  startAt: Date;
  ownSideId: string;
  ownTeamId: string;
  opponentSideId: string;
  opponentTeamId: string | null;
  role: 'team_owner' | 'team_manager';
}

@Injectable()
export class TeamMatchLineupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly operationAuditWriter: OperationAuditWriterService,
  ) {}

  async getLineup(user: V1AuthUser, teamMatchId: string) {
    return this.prisma.$transaction(async (tx) => {
      const context = await this.loadContext(tx, teamMatchId, user.id);
      const lineup = await this.lazyLock(
        tx,
        await this.latestLineup(tx, context.gameId, context.ownSideId),
        context.startAt,
      );
      const visibility = await tx.v1GameVisibilityPolicy.findUnique({
        where: { gameId: context.gameId },
      });
      // T1-5: the pitch-placement screen (D-17) needs the sport's formation
      // preset catalog to build slot-based placement — this is the single
      // server source of truth (apps/v1_web/src/components/lineup/formation-slots.ts).
      const config = await tx.v1CompetitionConfigVersion.findUnique({
        where: { id: context.gameCompetitionConfigVersionId },
        select: { lineup: true },
      });
      return {
        ...(await this.serializeLineup(tx, context, lineup, visibility?.lineupAt ?? null)),
        lineupConfig: parseLineupConfigForResponse(config?.lineup ?? null),
        eligibleMembers: await this.loadEligibleMembers(tx, context),
      };
    });
  }

  async saveLineup(
    user: V1AuthUser,
    teamMatchId: string,
    headerIdempotencyKey: string | undefined,
    dto: SaveTeamMatchLineupDto,
  ) {
    return this.serializable(async (tx) => {
      // Authorization/resource resolution always runs — even on an
      // idempotent replay — mirroring GamesService.withCommand, which
      // resolves the actor before consulting the idempotency record.
      const context = await this.loadContext(tx, teamMatchId, user.id);
      return this.withIdempotency(
        tx,
        {
          actorUserId: user.id,
          action: 'save',
          resourceId: teamMatchId,
          idempotencyKey: headerIdempotencyKey,
          payload: dto,
        },
        async () => {
          if (Date.now() >= context.startAt.getTime()) {
            throw new ConflictException({
              code: 'LINEUP_DEADLINE_PASSED',
              message: '경기 시작 이후에는 라인업을 직접 수정할 수 없어요. 상대팀에 정정을 요청해 주세요.',
            });
          }
          const previous = await this.lazyLock(
            tx,
            await this.latestLineup(tx, context.gameId, context.ownSideId),
            context.startAt,
          );
          if (previous !== null && previous.state !== V1GameLineupState.DRAFT) {
            throw new ConflictException({
              code: 'LINEUP_LOCKED_FOR_DIRECT_EDIT',
              message: '제출된 라인업은 직접 수정할 수 없어요. 상대팀의 정정 요청이 있어야 다시 작성할 수 있어요.',
            });
          }
          // The CAS token is the lineup chain's `revision`, not the raw
          // per-row `version` column: every save supersedes into a brand-new
          // row whose own `version` always restarts at 0, so `version` alone
          // could never detect "someone else already saved a newer draft".
          if ((previous?.revision ?? 0) !== dto.expectedVersion) {
            // details로 감싸지 않으면 AllExceptionsFilter가 messageObj?.details만 클라이언트로
            // 전달하기 때문에 expectedVersion/currentVersion이 응답에서 통째로 사라진다 —
            // team-schedules.service.ts 등 다른 VERSION_CONFLICT 던지는 곳과 동일한 계약으로 맞춘다.
            throw new ConflictException({
              code: 'VERSION_CONFLICT',
              message: '라인업이 그새 변경됐어요. 새로고침 후 다시 시도해 주세요.',
              details: { expectedVersion: dto.expectedVersion, currentVersion: previous?.revision ?? 0 },
            });
          }

          const entries = await this.resolveEntries(tx, context, dto);
          // 직전 리비전에서 본인이 켜 둔 **참가자 단위 공개 제외**(REVOKED)를 미리 읽어
          // 둔다. 저장은 매번 새 participant 행과 새 연결(linkId)을 만드는데, 공개 자격
          // 판정은 스냅샷을 **현재 연결의 linkId 로만** 읽는다
          // (games/public-records/public-consent.ts). 그래서 옮기지 않으면 본인이 "이 경기
          // 하나만 숨기겠다"고 껐던 기록이 **팀장의 라인업 재저장 한 번으로** 다시 공개된다
          // — 되돌릴 UI 가 없는 상태에서 본인 의사가 뒤집히므로 그대로 둘 수 없다.
          //
          // 정정 요청(requestChange)의 복사 리비전이 이미 같은 승계를 한다. 그 다음 단계가
          // 바로 이 재저장이라, 여기서 끊기면 사슬이 한 칸 뒤에서 무너진다. 읽기·쓰기 규칙이
          // 두 곳에서 갈리지 않도록 같은 헬퍼(latestConsentSnapshotByLinkId /
          // carryRevokedConsent)를 공유한다.
          const carriedConsentByUserId = await this.loadRevokedConsentByUserId(tx, previous?.id ?? null);
          const lineup = await tx.v1GameLineup.create({
            data: {
              gameId: context.gameId,
              sideId: context.ownSideId,
              revision: (previous?.revision ?? 0) + 1,
              supersedesId: previous?.id,
              formation: dto.formation,
            },
          });
          // createMany 대신 한 행씩 create 하는 이유: createMany 는 생성된 id 를 돌려주지
          // 않는데, 신원 연결(V1ParticipantIdentityLinkCurrent)의 키가 바로 그 participantId
          // 다. 저장 후 다시 조회해 이름으로 짝지으면 동명이인에서 **엉뚱한 사람에게 기록이
          // 붙는다** — 이 도메인에서 가장 큰 사고라 id 를 직접 받는 쪽을 택했다. 라인업 한
          // 건은 20명 안팎이라 왕복 비용도 문제되지 않으며, 대회 라인업의 범용 경로
          // (GamesService.saveLineup)도 같은 이유로 이미 개별 create 를 쓴다.
          for (const entry of entries) {
            const created = await tx.v1GameParticipant.create({
              data: {
                gameId: context.gameId,
                sideId: context.ownSideId,
                lineupId: lineup.id,
                userId: entry.userId,
                displayNameSnapshot: entry.displayNameSnapshot,
                jerseyNumber: entry.jerseyNumber ?? null,
                position: entry.position,
                // **명단 = 출전자**(정본 §3) — 이 경로가 만드는 행은 전부 출전자다.
                // 스키마 기본값도 true 지만 명시한다: 값이 무엇인지 여기서 읽히지 않으면
                // 다음 사람이 기본값을 바꿀 때 이 경로가 함께 뒤집히는 것을 못 본다.
                // (그래서 이 줄을 지우는 변이는 지금 green 이다 — 기본값이 같은 값이라
                //  관측 결과가 안 변한다. red 로 잡히는 것은 `false` 를 넣는 변이다.)
                started: true,
                positionX: entry.positionX ?? null,
                positionY: entry.positionY ?? null,
              },
            });
            // 비연동 게스트(userId === null)는 플랫폼 계정 자체가 없으므로 연결 대상이
            // 아니다 — 이름 스냅샷이 곧 정체성의 전부다(resolveEntry 참조).
            if (entry.userId === null) continue;
            // 팀장이 "이 사람은 우리 팀 아무개다"라고 주장하는 행위 그 자체를 연결로
            // 승격한다(ROSTER_ASSERTED, actor = 저장한 팀장). V1GameParticipant.userId 만
            // 실어서는 개인 기록이 절대 공개되지 않는다 — 공개 자격 판정
            // (isParticipantPubliclyEligible)이 요구하는 것은 이 연결 행이지 컬럼이
            // 아니기 때문이다. 스키마 주석이 약속하던 "userId 가 실려 저장되면 같은
            // 트랜잭션에서 연결도 자동 생성된다"를 이 경로가 지키지 않아, 리그 개인
            // 기록이 구조적으로 항상 빈 목록이었다(alpha 실측).
            //
            // 팀장의 일방적 주장이 프라이버시를 깨지는 않는다: 공개 노출에는 그 위에
            // 본인의 기록 공개 동의(V1UserRecordConsent = GRANTED)가 한 겹 더 필요하고
            // (games/public-records/public-consent.ts), 잘못 붙은 연결은 본인이
            // 신청·확인 경로로 되돌릴 수 있다.
            await createRosterAssertedIdentityLink(
              tx,
              created.id,
              entry.userId,
              { actorType: 'USER', actorUserId: user.id },
              'roster',
            );
            // 승계 판정 키는 **연결의 userId** 다(직전 participantId 가 아니다). 저장은
            // DTO 로부터 명단을 다시 만들어 행 대응이 1:1 이 아니고, 게스트로 올라갔던
            // 행을 본인이 신청·승인으로 가져가면 participant.userId 는 null 인데 연결에는
            // 사람이 있다 — 사람 기준으로 이어야 그 경우까지 끊기지 않는다. 게스트
            // (userId === null)는 위에서 이미 걸러져 여기 도달하지 않는다.
            await this.carryRevokedConsent(tx, created.id, carriedConsentByUserId.get(entry.userId));
          }
          return {
            teamMatchId,
            gameId: context.gameId,
            sideId: context.ownSideId,
            lineupId: lineup.id,
            revision: lineup.revision,
            state: lineup.state,
            version: lineup.revision,
          };
        },
      );
    });
  }

  async submitLineup(
    user: V1AuthUser,
    teamMatchId: string,
    headerIdempotencyKey: string | undefined,
    dto: SubmitTeamMatchLineupDto,
  ) {
    return this.serializable(async (tx) => {
      const context = await this.loadContext(tx, teamMatchId, user.id);
      return this.withIdempotency(
        tx,
        {
          actorUserId: user.id,
          action: 'submit',
          resourceId: teamMatchId,
          idempotencyKey: headerIdempotencyKey,
          payload: dto,
        },
        async () => {
          if (Date.now() >= context.startAt.getTime()) {
            throw new ConflictException({
              code: 'LINEUP_DEADLINE_PASSED',
              message: '경기 시작 이후에는 라인업을 제출할 수 없어요.',
            });
          }
          const lineup = await this.lazyLock(
            tx,
            await this.latestLineup(tx, context.gameId, context.ownSideId),
            context.startAt,
          );
          if (lineup === null) {
            throw new NotFoundException({
              code: 'LINEUP_DRAFT_NOT_FOUND',
              message: '제출할 라인업 초안이 없어요. 먼저 라인업을 작성해 주세요.',
            });
          }
          if (lineup.state !== V1GameLineupState.DRAFT) {
            throw new ConflictException({
              code: 'LINEUP_ALREADY_SUBMITTED',
              message: '이미 제출된 라인업이에요.',
            });
          }
          if (lineup.revision !== dto.expectedVersion) {
            throw new ConflictException({
              code: 'VERSION_CONFLICT',
              message: '라인업이 그새 변경됐어요. 새로고침 후 다시 시도해 주세요.',
              details: { expectedVersion: dto.expectedVersion, currentVersion: lineup.revision },
            });
          }
          const submitted = await tx.v1GameLineup.update({
            where: { id: lineup.id },
            data: {
              state: V1GameLineupState.SUBMITTED,
              submittedAt: new Date(),
              version: { increment: 1 },
            },
          });
          const publicLineupAt = await this.ensureDefaultPublicLineupTime(
            tx,
            context.gameId,
            context.startAt,
          );
          return {
            teamMatchId,
            gameId: context.gameId,
            sideId: context.ownSideId,
            lineupId: submitted.id,
            revision: submitted.revision,
            state: submitted.state,
            version: submitted.revision,
            publicLineupAt: publicLineupAt?.toISOString() ?? null,
          };
        },
      );
    });
  }

  async requestChange(
    user: V1AuthUser,
    teamMatchId: string,
    headerIdempotencyKey: string | undefined,
    dto: ChangeRequestTeamMatchLineupDto,
  ) {
    return this.serializable(async (tx) => {
      const context = await this.loadContext(tx, teamMatchId, user.id);
      return this.withIdempotency(
        tx,
        {
          actorUserId: user.id,
          action: 'change_request',
          resourceId: teamMatchId,
          idempotencyKey: headerIdempotencyKey,
          payload: dto,
        },
        async () => {
          const target = await this.lazyLock(
            tx,
            await this.latestLineup(tx, context.gameId, context.opponentSideId),
            context.startAt,
          );
          if (target === null || target.state === V1GameLineupState.DRAFT) {
            throw new NotFoundException({
              code: 'LINEUP_SUBMISSION_NOT_FOUND',
              message: '아직 제출된 상대팀 라인업이 없어요.',
            });
          }
          if (target.state === V1GameLineupState.LOCKED) {
            throw new ConflictException({
              code: 'LINEUP_LOCKED',
              message: '경기 시작 이후에는 정정을 요청할 수 없어요.',
            });
          }
          if (target.revision !== dto.expectedVersion) {
            // 호출자는 상대팀 사이드를 조회할 방법이 없어 이 currentVersion이 사실상 유일한
            // expectedVersion 획득 경로다 — 프론트는 첫 시도(버전 0)가 이 409로 실패하면
            // details.currentVersion으로 정확한 값을 알아내 한 번 더 재시도한다.
            throw new ConflictException({
              code: 'VERSION_CONFLICT',
              message: '라인업이 그새 변경됐어요. 새로고침 후 다시 시도해 주세요.',
              details: { expectedVersion: dto.expectedVersion, currentVersion: target.revision },
            });
          }
          const existingParticipants = await tx.v1GameParticipant.findMany({
            where: { lineupId: target.id },
          });
          // 원본 리비전에 걸려 있던 신원 연결을 함께 읽어 둔다. participant.userId 컬럼이
          // 아니라 **연결 테이블**이 정체성의 권위다 — 이름만 올라간 게스트 행을 본인이
          // 신청·승인(claim → ATTESTED)으로 가져간 경우, 컬럼은 null 인데 연결은 있다.
          const sourceLinks =
            existingParticipants.length === 0
              ? []
              : await tx.v1ParticipantIdentityLinkCurrent.findMany({
                  where: { participantId: { in: existingParticipants.map((participant) => participant.id) } },
                  select: { participantId: true, userId: true, linkId: true },
                });
          const sourceLinkByParticipantId = new Map(sourceLinks.map((link) => [link.participantId, link] as const));
          // 연결에 걸려 있던 **참가자 단위 공개 제외**(V1ParticipantConsentSnapshot =
          // REVOKED)도 같이 읽는다. 연결만 옮기고 이 override 를 두고 오면, 본인이
          // "이 경기 하나만 숨기겠다"고 껐던 기록이 **상대팀 팀장의 정정 요청 한 번으로**
          // 다시 공개된다 — 프라이버시가 줄어드는 방향이라 그대로 둘 수 없다.
          //
          // 무엇을·어떻게 옮기는지(REVOKED 만, 새 연결 아래 재기록, linkId 스코프와 최신
          // 선정 방식)는 `carryRevokedConsent` / `latestConsentSnapshotByLinkId` 한 곳에
          // 적혀 있고 `saveLineup` 도 같은 헬퍼를 쓴다 — 승계 규칙이 두 경로에서 갈리면
          // 사슬이 한쪽에서만 이어져 숨김이 조용히 새어 나간다.
          const latestSnapshotByLinkId = await this.latestConsentSnapshotByLinkId(
            tx,
            sourceLinks.map((link) => link.linkId),
          );
          const reopened = await tx.v1GameLineup.create({
            data: {
              gameId: context.gameId,
              sideId: context.opponentSideId,
              revision: target.revision + 1,
              supersedesId: target.id,
              formation: target.formation,
            },
          });
          // 정정 요청으로 다시 연 초안은 원본의 복사본이다 — 사람 연결도 그대로 따라가야
          // 상대팀이 수정할 때 정체성이 끊기지 않는다.
          //
          // **연결까지 복사해야 하는 이유**: 이 복사본이 그 사이드의 최신 리비전이 되고,
          // 결과 입력은 최신 리비전의 참가자만 모집단으로 삼는다
          // (games/core/latest-lineup-participants.ts + league-result-participants.ts 의
          // teamAuthored 판정 — revision>1 이라 "팀이 작성한 라인업"으로 잡힌다).
          // 연결 없이 두면 그 팀 **전원**의 개인 기록이 이 경기에서 공개 불가가 된다.
          // "그 팀이 다시 저장하면 붙는다"는 자가 치유는 성립하지 않는다 — 경기 시작
          // (startAt) 이후에는 saveLineup 이 LINEUP_DEADLINE_PASSED 로 막히므로
          // 킥오프 직전에 요청된 정정은 영구히 연결 없는 채로 남는다.
          //
          // 주체는 SYSTEM 이다. 이 초안을 만드는 사람은 **상대팀** 팀장이라, 그의 이름으로
          // "이 사람은 저 팀의 아무개다"를 주장하면 감사 기록이 실제 권위와 어긋난다.
          // 새 사실을 만드는 게 아니라 이미 있던 주장을 새 행으로 옮기는 것이므로
          // systemActor='LINEUP_REVISION_COPY' 로 남긴다.
          //
          // createMany 를 쓰지 않는 이유는 saveLineup 과 같다 — 연결의 키가 생성된
          // participantId 라 id 를 돌려받아야 한다(이름으로 되짚으면 동명이인에서 어긋난다).
          for (const participant of existingParticipants) {
            const copied = await tx.v1GameParticipant.create({
              data: {
                gameId: context.gameId,
                sideId: context.opponentSideId,
                lineupId: reopened.id,
                userId: participant.userId,
                displayNameSnapshot: participant.displayNameSnapshot,
                jerseyNumber: participant.jerseyNumber,
                position: participant.position,
                // 원본 행의 값을 **그대로** 옮긴다. 정본 §3 아래에서는 모두 true 라
                // 지금은 결과가 같지만, 복사가 원본과 다른 값을 만들어 내는 경로를
                // 남기지 않는다 — 이 복사본이 그 사이드의 최신 리비전이 되고 결과 입력의
                // 모집단이 되므로, 여기서 값을 지어내면 공식 기록이 원본과 갈린다.
                started: participant.started,
                positionX: participant.positionX,
                positionY: participant.positionY,
              },
            });
            const sourceLink = sourceLinkByParticipantId.get(participant.id);
            // 원본에 연결이 없던 행(게스트 등)은 복사본에도 만들지 않는다.
            if (sourceLink === undefined) continue;
            await createRosterAssertedIdentityLink(
              tx,
              copied.id,
              sourceLink.userId,
              { actorType: 'SYSTEM', systemActor: 'LINEUP_REVISION_COPY' },
              'lineup_change_request_copy',
            );
            // 승계 판정 키는 원본 참가자의 **linkId** 다 — 이 경로는 행을 1:1 로 복사하므로
            // 사람 기준으로 되짚을 필요가 없다(saveLineup 은 명단을 DTO 로부터 다시 만들어
            // 1:1 이 아니라 userId 로 잇는다). 옮기는 규칙 자체는 같은 헬퍼를 공유한다.
            await this.carryRevokedConsent(tx, copied.id, latestSnapshotByLinkId.get(sourceLink.linkId));
          }
          await this.operationAuditWriter.create(tx, {
            actor: { type: 'TEAM_MANAGER', id: user.id },
            requestId: `${context.gameId}:${reopened.id}`,
            action: 'LINEUP_CHANGE_REQUESTED',
            targetType: 'GAME',
            targetId: context.gameId,
            occurredAt: new Date(),
            before: null,
            after: {
              supersededLineupId: target.id,
              newDraftLineupId: reopened.id,
              sideId: context.opponentSideId,
              reason: dto.reason,
            },
          });
          return {
            teamMatchId,
            gameId: context.gameId,
            sideId: context.opponentSideId,
            lineupId: reopened.id,
            revision: reopened.revision,
            state: 'change_requested' as const,
            version: reopened.revision,
            reason: dto.reason,
          };
        },
      );
    });
  }

  /**
   * Runs a mutation under SERIALIZABLE isolation, mirroring
   * `GamesService.withCommand` — mutual exclusion for concurrent
   * save/submit/change-request on the same lineup chain comes from Postgres
   * rejecting the losing transaction's commit (40001), not from any
   * `WHERE state = ...` guard on the individual UPDATE statements.
   */
  private async serializable<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
    try {
      return await this.prisma.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw new ConflictException({
          code: 'COMMAND_CONCURRENCY_CONFLICT',
          message: '동시에 처리된 요청이 있어요. 최신 상태를 다시 불러와 주세요.',
        });
      }
      throw error;
    }
  }

  private async withIdempotency<T extends object>(
    tx: Transaction,
    input: {
      actorUserId: string;
      action: string;
      resourceId: string;
      idempotencyKey: string | undefined;
      payload: unknown;
    },
    mutate: () => Promise<T>,
  ): Promise<T & { replayed: boolean }> {
    const key = input.idempotencyKey?.trim();
    if (key === undefined || key.length === 0) {
      throw new UnprocessableEntityException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Idempotency-Key 헤더가 필요해요.',
      });
    }
    const payloadHash = canonicalGameCommandPayloadHash(input.payload);
    const existing = await tx.v1IdempotencyRecord.findUnique({
      where: {
        actorUserId_action_resourceType_resourceId_idempotencyKey: {
          actorUserId: input.actorUserId,
          action: input.action,
          resourceType: 'TEAM_MATCH_LINEUP',
          resourceId: input.resourceId,
          idempotencyKey: key,
        },
      },
    });
    if (existing !== null) {
      if (existing.payloadHash !== payloadHash) {
        throw new ConflictException({
          code: 'IDEMPOTENCY_PAYLOAD_CONFLICT',
          message: '같은 Idempotency-Key를 다른 요청 내용으로 재사용할 수 없어요.',
        });
      }
      return { ...(existing.responseBody as T), replayed: true };
    }
    const response = await mutate();
    await tx.v1IdempotencyRecord.create({
      data: {
        actorUserId: input.actorUserId,
        action: input.action,
        resourceType: 'TEAM_MATCH_LINEUP',
        resourceId: input.resourceId,
        idempotencyKey: key,
        payloadHash,
        responseStatus: 200,
        responseBody: response as unknown as Prisma.InputJsonValue,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    return { ...response, replayed: false };
  }

  // ─── internals ───────────────────────────────────────────────────────────

  /**
   * 주어진 연결들의 **최신 참가자 단위 동의 스냅샷**을 linkId 로 색인해 돌려준다.
   *
   * 최신 선정은 `consentVersion` 내림차순 + linkId 당 첫 행이다 — 공개 자격 판정
   * (`games/public-records/public-consent.ts` 의 `loadParticipantConsentEligibility`)이
   * 쓰는 방식과 **글자 그대로 같다**. 여기서 갈리면 승계한 값과 판정이 읽는 값이 어긋나
   * 숨김이 조용히 새어 나간다.
   */
  private async latestConsentSnapshotByLinkId(tx: Transaction, linkIds: readonly string[]) {
    const latest = new Map<
      string,
      { linkId: string; state: V1ConsentState; policyHash: string; actorUserId: string }
    >();
    if (linkIds.length === 0) return latest;
    const snapshots = await tx.v1ParticipantConsentSnapshot.findMany({
      where: { linkId: { in: [...linkIds] } },
      orderBy: { consentVersion: 'desc' },
      select: { linkId: true, state: true, policyHash: true, actorUserId: true },
    });
    for (const snapshot of snapshots) {
      if (!latest.has(snapshot.linkId)) latest.set(snapshot.linkId, snapshot);
    }
    return latest;
  }

  /**
   * 직전 리비전에서 **본인이 꺼 둔 공개 제외(REVOKED)** 를 사람(userId) 기준으로 모은다.
   *
   * `saveLineup` 은 라인업을 DTO 로부터 다시 만들기 때문에 옛 행과 새 행이 1:1 로 대응하지
   * 않는다. 그래서 키는 참가자 id 가 아니라 **연결의 userId** 다. `participant.userId`
   * 컬럼이 아니라 연결 테이블을 읽는 이유도 같다 — 게스트로 올라갔던 행을 본인이
   * 신청·승인(claim)으로 가져가면 컬럼은 null 인데 연결에는 사람이 있다.
   *
   * REVOKED 인 것만 담는다. 같은 사람이 직전 리비전에 두 행으로 올라가 있는 이상 상태라면
   * 한 번이라도 REVOKED 인 쪽이 남는다 — 노출을 **줄이는** 쪽이 안전한 기본값이다.
   */
  private async loadRevokedConsentByUserId(tx: Transaction, previousLineupId: string | null) {
    const carried = new Map<string, { state: V1ConsentState; policyHash: string; actorUserId: string }>();
    if (previousLineupId === null) return carried;
    const previousParticipants = await tx.v1GameParticipant.findMany({
      where: { lineupId: previousLineupId },
      select: { id: true },
    });
    if (previousParticipants.length === 0) return carried;
    const previousLinks = await tx.v1ParticipantIdentityLinkCurrent.findMany({
      where: { participantId: { in: previousParticipants.map((participant) => participant.id) } },
      select: { userId: true, linkId: true },
    });
    if (previousLinks.length === 0) return carried;
    const latestByLinkId = await this.latestConsentSnapshotByLinkId(
      tx,
      previousLinks.map((link) => link.linkId),
    );
    for (const link of previousLinks) {
      const snapshot = latestByLinkId.get(link.linkId);
      if (snapshot?.state !== V1ConsentState.REVOKED) continue;
      carried.set(link.userId, snapshot);
    }
    return carried;
  }

  /**
   * 방금 만든 참가자 행의 **새 연결 아래에** 승계 원본의 공개 제외를 다시 적는다.
   * `saveLineup`(재저장)과 `requestChange`(정정 복사)가 공유하는 단 하나의 쓰기 규칙이다.
   *
   * **연결을 새로 만들지 않고 재사용하는 쪽이 더 근본적이지 않은가**는 검토했고, 구조적으로
   * 불가능하다: `V1ParticipantIdentityLinkCurrent` 는 participantId 가 PK 이고 linkId 가
   * unique 라, 옛 리비전의 행이 살아 있는 동안 새 행에 같은 linkId 를 줄 수 없다. 떼어
   * 옮기면 옛 리비전의 정체성이 사라지고(대체된 옛 결과가 그 행을 가리킬 수 있다) 신원
   * 이벤트의 `(linkId, action)` unique 도 두 번째 ROSTER_ASSERTED 를 거부한다. 그래서
   * "새 연결 + 스냅샷 재기록"이 유일하게 가능한 승계 방식이다.
   */
  private async carryRevokedConsent(
    tx: Transaction,
    participantId: string,
    sourceSnapshot: { state: V1ConsentState; policyHash: string; actorUserId: string } | undefined,
  ): Promise<void> {
    // GRANTED 와 "스냅샷 없음"은 공개 판정 결과가 같다(REVOKED 만 판정을 바꾼다). 없는
    // 동의를 새 연결 아래에 만들어 주면 본인이 동의한 적 없는 연결에 동의를 날조하는
    // 셈이고 그 방향은 노출을 **늘린다** — 승계 대상은 REVOKED 하나뿐이다.
    if (sourceSnapshot?.state !== V1ConsentState.REVOKED) return;
    // 새 linkId 는 createRosterAssertedIdentityLink 가 내부에서 만들고 돌려주지 않으므로
    // 방금 걸린 연결을 되읽는다. REVOKED 였던 참가자에서만 도는 드문 경로라 statement 가
    // 늘어도 라인업 전체 비용에 영향이 없다.
    // findUnique 가 아니라 **Throw** 인 이유: 위 호출은 반환 시점에 연결 행이 있음을
    // 보장한다(있으면 조기 반환, 없으면 생성). 그 불변식이 깨졌는데 조용히 넘어가면
    // 숨김이 소리 없이 사라지는 지금 이 결함이 재발한다.
    const link = await tx.v1ParticipantIdentityLinkCurrent.findUniqueOrThrow({
      where: { participantId },
      select: { linkId: true },
    });
    await tx.v1ParticipantConsentSnapshot.create({
      data: {
        participantId,
        linkId: link.linkId,
        // 방금 만든 새 참가자 행이라 이 참가자 아래 스냅샷이 하나도 없다 —
        // `@@unique([participantId, consentVersion])` 기준으로 1 번이 항상 비어 있으므로
        // 최댓값을 다시 조회하지 않는다.
        consentVersion: 1,
        state: V1ConsentState.REVOKED,
        // 숨김을 결정한 사람과 그때의 정책 해시를 그대로 물려받는다. 여기에 저장·정정을
        // 실행한 팀장을 적으면 본인이 하지 않은 프라이버시 결정을 그의 이름으로 남기게 된다.
        policyHash: sourceSnapshot.policyHash,
        actorUserId: sourceSnapshot.actorUserId,
      },
    });
  }

  private async loadContext(
    tx: Transaction,
    teamMatchId: string,
    userId: string,
  ): Promise<TeamMatchLineupContext> {
    const teamMatch = await tx.v1TeamMatch.findUnique({
      where: { id: teamMatchId },
      select: {
        id: true,
        hostTeamId: true,
        approvedApplicantTeamId: true,
        startAt: true,
      },
    });
    if (teamMatch === null) {
      throw new NotFoundException({
        code: 'TEAM_MATCH_NOT_FOUND',
        message: '팀 매칭을 찾을 수 없어요.',
      });
    }
    const game = await tx.v1Game.findUnique({
      where: { teamMatchId },
      select: { id: true, competitionConfigVersionId: true },
    });
    if (game === null) {
      throw new ConflictException({
        code: 'TEAM_MATCH_GAME_REQUIRED',
        message: '경기 정보가 아직 준비되지 않았어요.',
      });
    }
    const sides = await tx.v1GameSide.findMany({ where: { gameId: game.id } });
    const hostSide = sides.find((side) => side.sideKey === 'HOME');
    const awaySide = sides.find((side) => side.sideKey === 'AWAY');
    if (hostSide === undefined || awaySide === undefined) {
      throw new ConflictException({
        code: 'TEAM_MATCH_GAME_REQUIRED',
        message: '경기 진영 정보가 아직 준비되지 않았어요.',
      });
    }
    const teamIds = [teamMatch.hostTeamId, teamMatch.approvedApplicantTeamId].filter(
      (id): id is string => id !== null,
    );
    const membership = await tx.v1TeamMembership.findFirst({
      where: { teamId: { in: teamIds }, userId, status: 'active', role: { in: ['owner', 'manager'] } },
    });
    if (membership === null) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: '팀장 또는 매니저만 라인업을 관리할 수 있어요.',
      });
    }
    const role = membership.role === 'owner' ? ('team_owner' as const) : ('team_manager' as const);
    if (membership.teamId === teamMatch.hostTeamId) {
      return {
        gameId: game.id,
        gameCompetitionConfigVersionId: game.competitionConfigVersionId,
        teamMatchId,
        startAt: teamMatch.startAt,
        ownSideId: hostSide.id,
        ownTeamId: teamMatch.hostTeamId,
        opponentSideId: awaySide.id,
        opponentTeamId: teamMatch.approvedApplicantTeamId,
        role,
      };
    }
    return {
      gameId: game.id,
      gameCompetitionConfigVersionId: game.competitionConfigVersionId,
      teamMatchId,
      startAt: teamMatch.startAt,
      ownSideId: awaySide.id,
      ownTeamId: membership.teamId,
      opponentSideId: hostSide.id,
      opponentTeamId: teamMatch.hostTeamId,
      role,
    };
  }

  /**
   * 지금 이 라인업에 등록할 수 있는 팀원 목록.
   *
   * 저장 시점의 자격 판정(resolveEntry)과 **완전히 같은 조건**을 화면에 미리 알려주기
   * 위한 읽기 경로다. 화면은 지금껏 팀원 전체만 알고 있어서, 참석 응답을 하지 않은
   * 팀원을 명단에 넣고 저장 버튼을 눌러야 비로소 422를 만났다. 판정 규칙을 프론트에
   * 복제하면 서버와 갈라지므로, 규칙을 이미 소유한 이쪽이 결과만 내려준다.
   *
   * `attending`은 이 팀 매치에 연결된 팀 일정이 있을 때만 의미가 있다 — 일정이 없으면
   * resolveEntry도 참석 검증을 건너뛰므로 여기서도 전원 true다.
   *
   * `jerseyNumber`는 팀 고정 등번호로, 라인업 화면의 등번호 자동 채움이 2순위 소스로
   * 쓴다(1순위는 불러온 라인업의 값, 3순위는 그 선수가 직전에 달았던 번호).
   */
  private async loadEligibleMembers(tx: Transaction, context: TeamMatchLineupContext) {
    const memberships = await tx.v1TeamMembership.findMany({
      where: { teamId: context.ownTeamId, status: 'active' },
      select: {
        userId: true,
        jerseyNumber: true,
        user: { select: { profile: { select: { nickname: true, displayName: true } } } },
      },
    });
    const schedule = await tx.v1TeamSchedule.findFirst({
      where: { teamMatchId: context.teamMatchId, teamId: context.ownTeamId },
      select: { id: true },
    });
    const goingUserIds = new Set<string>();
    if (schedule !== null) {
      const attendances = await tx.v1ScheduleAttendance.findMany({
        where: { scheduleId: schedule.id, status: 'GOING' },
        select: { userId: true },
      });
      for (const attendance of attendances) goingUserIds.add(attendance.userId);
    }
    return memberships.map((membership) => ({
      userId: membership.userId,
      displayName:
        membership.user.profile?.nickname || membership.user.profile?.displayName || '팀원',
      jerseyNumber: membership.jerseyNumber,
      attending: schedule === null ? true : goingUserIds.has(membership.userId),
    }));
  }

  private async latestLineup(tx: Transaction, gameId: string, sideId: string) {
    return tx.v1GameLineup.findFirst({
      where: { gameId, sideId },
      orderBy: { revision: 'desc' },
    });
  }

  /** Deadline is the match's own `startAt`: once reached, a still-SUBMITTED
   * lineup is lazily flipped to LOCKED (no cron/worker required — the first
   * request to observe the passed deadline performs the transition).
   *
   * Not generic: every call site passes the full `V1GameLineup` row (or
   * `null`) straight from `latestLineup()`/`findFirst`, and the update below
   * always returns that same concrete Prisma row shape, so there is no `T`
   * to preserve — declaring one only forced an unsound `as T` cast to make
   * the locked-row result satisfy an unrelated generic parameter. */
  private async lazyLock(
    tx: Transaction,
    lineup: V1GameLineup | null,
    startAt: Date,
  ): Promise<V1GameLineup | null> {
    if (lineup === null || lineup.state !== V1GameLineupState.SUBMITTED) {
      return lineup;
    }
    if (Date.now() < startAt.getTime()) {
      return lineup;
    }
    return tx.v1GameLineup.update({
      where: { id: lineup.id },
      data: { state: V1GameLineupState.LOCKED, version: { increment: 1 } },
    });
  }

  private async ensureDefaultPublicLineupTime(tx: Transaction, gameId: string, startAt: Date) {
    const defaultLineupAt = new Date(startAt.getTime() - 60 * 60 * 1000);
    const policy = await tx.v1GameVisibilityPolicy.findUnique({ where: { gameId } });
    if (policy === null) {
      return null;
    }
    if (policy.lineupAt !== null) {
      return policy.lineupAt;
    }
    const updated = await tx.v1GameVisibilityPolicy.updateMany({
      where: { gameId, lineupAt: null },
      data: { lineupAt: defaultLineupAt, version: { increment: 1 } },
    });
    return updated.count > 0 ? defaultLineupAt : (await tx.v1GameVisibilityPolicy.findUnique({ where: { gameId } }))?.lineupAt ?? null;
  }

  private async resolveEntries(
    tx: Transaction,
    context: TeamMatchLineupContext,
    dto: SaveTeamMatchLineupDto,
  ) {
    // Task 163 — 제출 시점의 **인원·골키퍼 검증을 하지 않는다.**
    //
    // 명단 제출은 "누가 오나"만 받는다. 정본 §3 이 선발/후보 구분을 없앴으므로 여기서
    // 셀 "선발" 이라는 개념 자체가 없다 — 명단에 있으면 그 경기에 뛴 것이다.
    //
    // 함께 사라지는 규칙이 하나 더 있다: `후보는 최대 N명`(교체 가능 인원 제한)도 같은
    // `LINEUP_SIZE_INVALID` 로 막고 있었는데, 후보라는 구분이 제출에서 없어지므로 셀
    // 대상이 없다. 교체 횟수 제한 자체는 콘솔 교체 경로가 계속 본다 — 여기서 미리
    // 막던 것만 없어진다.
    //
    // 인원 규칙을 되살리려면 "인원이 안 맞아도 경기는 시작하고 운영 콘솔에서 조정한다"는
    // 사용자 확정부터 뒤집어야 한다(정본 §3).

    // **빈 명단은 막는다.** 인원 min~max 게이트를 없앤 것과 다른 문제다 — 이건 선발
    // 규칙이 아니라 **데이터 손실 가드**다. 이 경로는 저장할 때마다 새 리비전을 만들므로
    // 옛 행이 지워지지는 않지만, 읽는 쪽은 전부 **최신 리비전**을 본다
    // (serializeLineup · league-result-participants). 빈 리비전이 최신이 되면 그 팀의
    // 명단이 화면에서 사라지고 출전 기록도 만들어지지 않는다.
    if (rosterOf(dto).length === 0) {
      throw new BadRequestException({
        code: 'LINEUP_EMPTY',
        message: '명단에 최소 한 명은 있어야 해요.',
      });
    }

    // 지운 센티널이 **입력으로 되돌아오는 것**을 막는다. `position` 은 클라이언트가 보내는
    // 자유 문자열이라, 마이그레이션이 정리한 'BENCH' 가 다음 저장 요청으로 그대로 다시
    // 들어올 수 있다. 'BENCH' 만 막으면 '벤치'·'sub'·오타는 그대로 들어오므로 **카탈로그에
    // 있는 값만** 통과시킨다(근거는 games/core/lineup-position.ts).
    //
    // BE-1 이 인원 검증과 함께 지웠던 config 조회를 여기서 되살린다 — 그때는 죽은 조회라
    // 지운 것이고, 지금은 이 가드가 유일한 소비처다.
    //
    // ⚠️ 재는 것은 **클라이언트가 보낸 `entry.position` 뿐**이다. 골키퍼는 아래에서 서버가
    // `GOALKEEPER_MARKER('GK')` 로 눌러 담는데, 풋살 카탈로그에는 'GK' 가 없고 'GOLEIRO'
    // 가 있어서(실측) 그 리터럴까지 카탈로그로 재면 풋살 골키퍼 저장이 전부 막힌다.
    const lineupConfig = await tx.v1CompetitionConfigVersion.findUnique({
      where: { id: context.gameCompetitionConfigVersionId },
      select: { lineup: true },
    });
    const rejectedPosition = findRejectedLineupPosition(
      rosterOf(dto).map((entry) => entry.position),
      parseLineupCatalog(lineupConfig?.lineup ?? null).positions.map((position) => position.code),
    );
    if (rejectedPosition !== null) {
      throw new BadRequestException({
        code: 'LINEUP_POSITION_INVALID',
        message: rejectedLineupPositionMessage(rejectedPosition),
      });
    }

    const jerseyNumbers = rosterOf(dto)
      .map((entry) => entry.jerseyNumber)
      .filter((jerseyNumber): jerseyNumber is number => jerseyNumber !== undefined);
    if (new Set(jerseyNumbers).size !== jerseyNumbers.length) {
      throw new UnprocessableEntityException({
        code: 'LINEUP_DUPLICATE_JERSEY_NUMBER',
        message: '등번호가 중복돼요. 등번호는 팀 내에서 유일해야 해요.',
      });
    }

    // 같은 연동 사용자를 선발+후보를 통틀어 두 번 이상 등록할 수 없다. 이 방어가 없으면
    // 클라이언트가 재수화(hydrate) 시점의 정체성 유실 버그(Task 15 blocker-1) 때문에, 또는
    // 어떤 클라이언트든 버그·경합으로 같은 userId를 두 번 실어 보내는 순간 한 사람에 대해
    // 두 개의 V1GameParticipant 행이 생겨버린다 — 서버가 최종 방어선이다.
    const userIds = rosterOf(dto)
      .map((entry) => entry.userId)
      .filter((userId): userId is string => userId !== undefined);
    if (new Set(userIds).size !== userIds.length) {
      throw new UnprocessableEntityException({
        code: 'LINEUP_DUPLICATE_PARTICIPANT',
        message: '같은 선수가 라인업에 두 번 등록되어 있어요.',
      });
    }

    // **명단 = 출전자**이므로 갈래가 하나다(정본 §3). 예전엔 후보의 position 을 'BENCH' 로
    // 덮어썼는데(센티널), 그러면 같은 컬럼이 대회 경기에서는 실제 포지션 코드를 뜻하고
    // 팀 매치에서는 선발 여부를 뜻해 읽는 쪽마다 소스별 분기가 생겼다 — 그 관례를 없앴다.
    return Promise.all(
      rosterOf(dto).map((entry) =>
        this.resolveEntry(
          tx,
          context,
          entry,
          entry.goalkeeper === true ? GOALKEEPER_MARKER : (entry.position ?? null),
        ),
      ),
    );
  }

  private async resolveEntry(
    tx: Transaction,
    context: TeamMatchLineupContext,
    entry: TeamMatchLineupParticipantDto,
    position: string | null,
  ): Promise<{
    userId: string | null;
    displayNameSnapshot: string;
    jerseyNumber?: number;
    position: string | null;
    positionX?: number;
    positionY?: number;
  }> {
    if (entry.userId === undefined) {
      const displayName = entry.displayName?.trim();
      if (displayName === undefined || displayName.length === 0) {
        throw new UnprocessableEntityException({
          code: 'LINEUP_PARTICIPANT_INVALID',
          message: '연결된 선수의 userId 또는 게스트 이름 중 하나는 반드시 입력해야 해요.',
        });
      }
      return {
        // 비연동 게스트 — 플랫폼 계정이 없으므로 정체성은 이름뿐이다.
        userId: null,
        displayNameSnapshot: displayName,
        jerseyNumber: entry.jerseyNumber,
        position,
        positionX: entry.positionX,
        positionY: entry.positionY,
      };
    }
    const membership = await tx.v1TeamMembership.findFirst({
      where: { teamId: context.ownTeamId, userId: entry.userId, status: 'active' },
      select: {
        userId: true,
        user: { select: { profile: { select: { nickname: true, displayName: true } } } },
      },
    });
    if (membership === null) {
      throw new UnprocessableEntityException({
        code: 'LINEUP_PARTICIPANT_INELIGIBLE',
        message: '현재 팀 소속이 아닌 사용자는 라인업에 등록할 수 없어요.',
      });
    }
    const schedule = await tx.v1TeamSchedule.findFirst({
      where: { teamMatchId: context.teamMatchId, teamId: context.ownTeamId },
      select: { id: true },
    });
    if (schedule !== null) {
      const attendance = await tx.v1ScheduleAttendance.findUnique({
        where: { scheduleId_userId: { scheduleId: schedule.id, userId: entry.userId } },
        select: { status: true },
      });
      if (attendance === undefined || attendance === null || attendance.status !== 'GOING') {
        throw new UnprocessableEntityException({
          code: 'LINEUP_PARTICIPANT_INELIGIBLE',
          message: '참석으로 응답한 팀원만 라인업에 등록할 수 있어요.',
        });
      }
    }
    const displayNameSnapshot =
      entry.displayName?.trim() ||
      membership.user.profile?.nickname ||
      membership.user.profile?.displayName ||
      '팀원';
    return {
      // 이 열쇠가 있어야 다음에 이 라인업을 불러올 때 이름이 아니라 사람으로 대조된다 —
      // 동명이인이나 닉네임 변경에도 같은 사람으로 이어진다.
      userId: membership.userId,
      displayNameSnapshot,
      jerseyNumber: entry.jerseyNumber,
      position,
      positionX: entry.positionX,
      positionY: entry.positionY,
    };
  }

  private async serializeLineup(
    tx: Transaction,
    context: TeamMatchLineupContext,
    lineup: {
      id: string;
      revision: number;
      state: V1GameLineupState;
      version: number;
      formation: string | null;
    } | null,
    publicLineupAt: Date | null,
  ) {
    const participants =
      lineup === null
        ? []
        : await tx.v1GameParticipant.findMany({
            where: { lineupId: lineup.id },
            orderBy: { createdAt: 'asc' },
          });
    // **명단 = 출전자**라 갈래가 없다(정본 §3). 아래 `starters`/`bench` 는 아직 그 두 칸을
    // 읽는 프론트를 위해 같은 값을 다른 모양으로 한 번 더 담는 것이고, `bench` 는 항상 빈
    // 배열이다 — 프론트가 `participants` 로 넘어가면(FE-1) 둘 다 지운다.
    const roster = participants.map((participant) => ({
      // Task 17: the result-entry form needs the real `V1GameParticipant.id`
      // to attribute a goal/card to a specific roster entry — this route was
      // the only existing lineup read and previously erased the id.
      id: participant.id,
      // 저장된 사람 연결. 화면이 재수화할 때 이름 매칭 휴리스틱 대신 이 값을 쓰면
      // 같은 이름의 다른 팀원을 혼동하지 않는다.
      userId: participant.userId,
      displayName: participant.displayNameSnapshot,
      jerseyNumber: participant.jerseyNumber,
      position: participant.position === GOALKEEPER_MARKER ? null : participant.position,
      goalkeeper: participant.position === GOALKEEPER_MARKER,
      positionX: participant.positionX,
      positionY: participant.positionY,
    }));

    return {
      teamMatchId: context.teamMatchId,
      gameId: context.gameId,
      sideId: context.ownSideId,
      role: context.role,
      lineupId: lineup?.id ?? null,
      revision: lineup?.revision ?? 0,
      state: lineup?.state ?? V1GameLineupState.DRAFT,
      version: lineup?.revision ?? 0,
      formation: lineup?.formation ?? null,
      publicLineupAt: publicLineupAt?.toISOString() ?? null,
      participants: roster,
      // 옛 두 칸 — 같은 명단을 프론트가 아직 읽는 모양으로 한 번 더 담는다.
      // 명단 = 출전자이므로 `bench` 는 언제나 비어 있다.
      starters: roster,
      bench: [] as typeof roster,
    };
  }
}
