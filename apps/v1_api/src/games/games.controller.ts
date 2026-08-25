import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseEnumPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { OptionalV1AuthGuard } from '../auth/optional-v1-auth.guard';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { CancelGameDto, GameCommandDto, GameCommandName } from './dto/game-command.dto';
import {
  AppendGameEventDto,
  AssignGoalAssistDto,
  ListGameEventsQueryDto,
  ReverseGameEventDto,
} from './dto/game-event.dto';
import { SaveGameLineupDto, SetParticipantArrivalDto, SubmitGameLineupDto } from './dto/game-lineup.dto';
import {
  CreateGameResultRevisionDto,
  DecideGameResultRevisionDto,
  GameResultRecoveryDto,
  SubmitGameResultRevisionDto,
} from './dto/game-result.dto';
import {
  AttestIdentityLinkDto,
  GrantParticipantConsentDto,
  RequestIdentityLinkDto,
  RevokeIdentityLinkDto,
  RevokeParticipantConsentDto,
} from './dto/game-participant-identity.dto';
import { GameBroadcastRegistry } from './game-broadcast.registry';
import type { GameEventAppendResult } from './games.types';
import { GamesService } from './games.service';

@Controller('games')
export class GamesController {
  constructor(
    private readonly gamesService: GamesService,
    private readonly gameBroadcast: GameBroadcastRegistry,
  ) {}

  /**
   * Fan the just-committed event out to `game:<gameId>` subscribers.
   *
   * The socket lane (`RealtimeGateway.acknowledgeGameEvent`) has always done
   * this for `game.event.append`/`game.event.retry`; the REST lane below writes
   * to the same durable event log through the same `GamesService` methods but
   * used to notify nobody, so an operator console subscribed to the game only
   * learned about a REST-originated goal/reversal/assist on its next manual
   * refetch. Same event name and same payload shape as the socket lane — the
   * frozen realtime contract already requires receivers to de-duplicate by
   * durable `sequence`, so a client that sees both is unaffected.
   *
   * An idempotent replay is deliberately still broadcast: the gateway does the
   * same (it emits on `status: 'replayed'` too), and sequence-based de-dup on
   * the receiving side makes the extra delivery inert.
   *
   * A result WITHOUT `event` is deliberately NOT broadcast. `event` is optional
   * only for an idempotent replay of a request stored before that field existed
   * (see its doc comment in games.types.ts); emitting `event: undefined` would
   * reintroduce the exact `id: undefined` / `reversesEventId: undefined`
   * scoreboard corruption that field was added to fix. Dropping the delivery is
   * safe — a replay carries no new durable sequence for a subscriber to miss.
   */
  private broadcastCommitted(gameId: string, result: GameEventAppendResult): GameEventAppendResult {
    if (result.event === undefined) return result;
    this.gameBroadcast.emitToGame(gameId, 'game.event.committed', {
      gameId,
      sequence: result.sequence,
      version: result.version,
      event: result.event,
    });
    return result;
  }

  @Get(':gameId/visibility')
  @UseGuards(OptionalV1AuthGuard)
  visibility(@Param('gameId') gameId: string) {
    return this.gamesService.getVisibility(gameId);
  }

  @Get(':gameId')
  @UseGuards(V1AuthGuard)
  get(@CurrentUser() user: V1AuthUser, @Param('gameId') gameId: string) {
    return this.gamesService.getGame(user, gameId);
  }

  @Post(':gameId/commands/:command')
  @UseGuards(V1AuthGuard)
  command(
    @CurrentUser() user: V1AuthUser,
    @Param('gameId') gameId: string,
    @Param('command', new ParseEnumPipe(GameCommandName)) command: GameCommandName,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: GameCommandDto,
  ) {
    return this.gamesService.executeCommand(user, gameId, command, idempotencyKey, dto);
  }

  @Post(':gameId/cancel')
  @UseGuards(V1AuthGuard)
  cancel(
    @CurrentUser() user: V1AuthUser,
    @Param('gameId') gameId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CancelGameDto,
  ) {
    return this.gamesService.cancel(user, gameId, idempotencyKey, dto);
  }

  @Get(':gameId/events')
  @UseGuards(V1AuthGuard)
  events(
    @CurrentUser() user: V1AuthUser,
    @Param('gameId') gameId: string,
    @Query() query: ListGameEventsQueryDto,
  ) {
    return this.gamesService.listEvents(user, gameId, query.validatedAfterSequence);
  }

  @Post(':gameId/events')
  @UseGuards(V1AuthGuard)
  appendEvent(
    @CurrentUser() user: V1AuthUser,
    @Param('gameId') gameId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: AppendGameEventDto,
  ) {
    return this.gamesService
      .appendEvent(user, gameId, idempotencyKey, dto)
      .then((result) => this.broadcastCommitted(gameId, result));
  }

  @Post(':gameId/events/:eventId/reverse')
  @UseGuards(V1AuthGuard)
  reverseEvent(
    @CurrentUser() user: V1AuthUser,
    @Param('gameId') gameId: string,
    @Param('eventId') eventId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: ReverseGameEventDto,
  ) {
    return this.gamesService
      .reverseEvent(user, gameId, eventId, idempotencyKey, dto)
      .then((result) => this.broadcastCommitted(gameId, result));
  }

  @Post(':gameId/events/:eventId/assist')
  @UseGuards(V1AuthGuard)
  assignGoalAssist(
    @CurrentUser() user: V1AuthUser,
    @Param('gameId') gameId: string,
    @Param('eventId') eventId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: AssignGoalAssistDto,
  ) {
    return this.gamesService
      .assignGoalAssist(user, gameId, eventId, idempotencyKey, dto)
      .then((result) => this.broadcastCommitted(gameId, result));
  }

  @Get(':gameId/lineups')
  @UseGuards(V1AuthGuard)
  lineups(@CurrentUser() user: V1AuthUser, @Param('gameId') gameId: string) {
    return this.gamesService.listLineups(user, gameId);
  }

  @Get(':gameId/operations-lineup')
  @UseGuards(V1AuthGuard)
  operationsLineup(@CurrentUser() user: V1AuthUser, @Param('gameId') gameId: string) {
    return this.gamesService.listOperationsLineups(user, gameId);
  }

  @Put(':gameId/lineups/:sideId')
  @UseGuards(V1AuthGuard)
  saveLineup(
    @CurrentUser() user: V1AuthUser,
    @Param('gameId') gameId: string,
    @Param('sideId') sideId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: SaveGameLineupDto,
  ) {
    return this.gamesService.saveLineup(user, gameId, sideId, idempotencyKey, dto);
  }

  @Post(':gameId/lineups/:lineupId/submit')
  @UseGuards(V1AuthGuard)
  submitLineup(
    @CurrentUser() user: V1AuthUser,
    @Param('gameId') gameId: string,
    @Param('lineupId') lineupId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: SubmitGameLineupDto,
  ) {
    return this.gamesService.submitLineup(user, gameId, lineupId, idempotencyKey, dto);
  }

  /**
   * 명단 검인(체크인). 라인업 저장/제출과 달리 `lineupId` 가 아니라 participantId 로
   * 직접 지목한다 — 스태프가 현장에서 명단을 훑으며 한 명씩 누르는 조작이라, 어느
   * 라인업 리비전에 속하는지를 클라이언트가 알아야 할 이유가 없다.
   */
  @Patch(':gameId/participants/:participantId/arrival')
  @UseGuards(V1AuthGuard)
  setParticipantArrival(
    @CurrentUser() user: V1AuthUser,
    @Param('gameId') gameId: string,
    @Param('participantId') participantId: string,
    @Body() dto: SetParticipantArrivalDto,
  ) {
    return this.gamesService.setParticipantArrival(user, gameId, participantId, dto.arrived);
  }

  @Post(':gameId/result-recovery/derive-and-submit')
  @UseGuards(V1AuthGuard)
  resultRecoveryDeriveAndSubmit(
    @CurrentUser() user: V1AuthUser,
    @Param('gameId') gameId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: GameResultRecoveryDto,
  ) {
    return this.gamesService.resultRecoveryDeriveAndSubmit(user, gameId, idempotencyKey, dto);
  }

  @Get(':gameId/result-revisions')
  @UseGuards(V1AuthGuard)
  resultRevisions(@CurrentUser() user: V1AuthUser, @Param('gameId') gameId: string) {
    return this.gamesService.listResultRevisions(user, gameId);
  }

  @Post(':gameId/result-revisions')
  @UseGuards(V1AuthGuard)
  createResultRevision(
    @CurrentUser() user: V1AuthUser,
    @Param('gameId') gameId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreateGameResultRevisionDto,
  ) {
    return this.gamesService.createResultRevision(user, gameId, idempotencyKey, dto);
  }

  @Post(':gameId/result-revisions/:revisionId/submit')
  @UseGuards(V1AuthGuard)
  submitResultRevision(
    @CurrentUser() user: V1AuthUser,
    @Param('gameId') gameId: string,
    @Param('revisionId') revisionId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: SubmitGameResultRevisionDto,
  ) {
    return this.gamesService.submitResultRevision(
      user,
      gameId,
      revisionId,
      idempotencyKey,
      dto,
    );
  }

  @Post(':gameId/result-revisions/:revisionId/decision')
  @UseGuards(V1AuthGuard)
  decideResultRevision(
    @CurrentUser() user: V1AuthUser,
    @Param('gameId') gameId: string,
    @Param('revisionId') revisionId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: DecideGameResultRevisionDto,
  ) {
    return this.gamesService.decideResultRevision(
      user,
      gameId,
      revisionId,
      idempotencyKey,
      dto,
    );
  }

  /**
   * 승인함 목록 (attest UI C안) — 내가 승인할 수 있는 대기 중 신원 연결 요청.
   * attest 에 필요한 requestId·expectedVersion 을 알아낼 유일한 조회 경로다.
   */
  @Get(':gameId/identity-link-requests/pending')
  @UseGuards(V1AuthGuard)
  pendingIdentityLinkRequests(@CurrentUser() user: V1AuthUser, @Param('gameId') gameId: string) {
    return this.gamesService.listPendingIdentityLinkRequests(user, gameId);
  }

  @Post(':gameId/participants/:participantId/identity-link-requests')
  @UseGuards(V1AuthGuard)
  requestIdentityLink(
    @CurrentUser() user: V1AuthUser,
    @Param('gameId') gameId: string,
    @Param('participantId') participantId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: RequestIdentityLinkDto,
  ) {
    return this.gamesService.requestIdentityLink(user, gameId, participantId, idempotencyKey, dto);
  }

  @Post(':gameId/participants/:participantId/identity-link-requests/:requestId/attest')
  @UseGuards(V1AuthGuard)
  attestIdentityLink(
    @CurrentUser() user: V1AuthUser,
    @Param('gameId') gameId: string,
    @Param('participantId') participantId: string,
    @Param('requestId') requestId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: AttestIdentityLinkDto,
  ) {
    return this.gamesService.attestIdentityLink(
      user,
      gameId,
      participantId,
      requestId,
      idempotencyKey,
      dto,
    );
  }

  @Post(':gameId/participants/:participantId/identity-links/:linkId/revoke')
  @UseGuards(V1AuthGuard)
  revokeIdentityLink(
    @CurrentUser() user: V1AuthUser,
    @Param('gameId') gameId: string,
    @Param('participantId') participantId: string,
    @Param('linkId') linkId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: RevokeIdentityLinkDto,
  ) {
    return this.gamesService.revokeIdentityLink(
      user,
      gameId,
      participantId,
      linkId,
      idempotencyKey,
      dto,
    );
  }

  @Post(':gameId/participants/:participantId/consents/grant')
  @UseGuards(V1AuthGuard)
  grantParticipantConsent(
    @CurrentUser() user: V1AuthUser,
    @Param('gameId') gameId: string,
    @Param('participantId') participantId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: GrantParticipantConsentDto,
  ) {
    return this.gamesService.grantParticipantConsent(
      user,
      gameId,
      participantId,
      idempotencyKey,
      dto,
    );
  }

  @Post(':gameId/participants/:participantId/consents/revoke')
  @UseGuards(V1AuthGuard)
  revokeParticipantConsent(
    @CurrentUser() user: V1AuthUser,
    @Param('gameId') gameId: string,
    @Param('participantId') participantId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: RevokeParticipantConsentDto,
  ) {
    return this.gamesService.revokeParticipantConsent(
      user,
      gameId,
      participantId,
      idempotencyKey,
      dto,
    );
  }
}
