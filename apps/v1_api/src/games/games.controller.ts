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
  SubmitGameResultRevisionDto,
} from './dto/game-result.dto';
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
    return this.gamesService.listEvents(user, gameId, query.afterSequence);
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
}
