import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseEnumPipe,
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
  ListGameEventsQueryDto,
  ReverseGameEventDto,
} from './dto/game-event.dto';
import { SaveGameLineupDto, SubmitGameLineupDto } from './dto/game-lineup.dto';
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
import { GamesService } from './games.service';

@Controller('games')
export class GamesController {
  constructor(private readonly gamesService: GamesService) {}

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
    return this.gamesService.appendEvent(user, gameId, idempotencyKey, dto);
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
    return this.gamesService.reverseEvent(user, gameId, eventId, idempotencyKey, dto);
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
