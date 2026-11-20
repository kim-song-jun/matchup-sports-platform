import { Controller, Get, Header, Param, ParseEnumPipe, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { AdminEntityOperationsService } from './admin-entity-operations.service';
import { AdminEntityOperationsQueryDto } from './dto/admin-entity-operations.dto';

enum Entity { users = 'users', teams = 'teams' }
enum Section { history = 'history', inquiries = 'inquiries', matches = 'matches', competitions = 'competitions', appearances = 'appearances', upcoming = 'upcoming' }

@Controller('admin')
@UseGuards(V1AuthGuard)
export class AdminEntityOperationsController {
  constructor(private readonly operations: AdminEntityOperationsService) {}

  @Get(':entity/:id/operations')
  @Header('Cache-Control', 'private, no-store')
  context(@CurrentUser() actor: V1AuthUser, @Param('entity', new ParseEnumPipe(Entity)) entity: Entity,
    @Param('id', ParseUUIDPipe) id: string) {
    return this.operations.context(actor.id, entity, id);
  }

  @Get(':entity/:id/operations/:section')
  @Header('Cache-Control', 'private, no-store')
  list(@CurrentUser() actor: V1AuthUser, @Param('entity', new ParseEnumPipe(Entity)) entity: Entity,
    @Param('id', ParseUUIDPipe) id: string, @Param('section', new ParseEnumPipe(Section)) section: Section,
    @Query() query: AdminEntityOperationsQueryDto) {
    return this.operations.list(actor.id, entity, id, section, query.page ?? 1);
  }
}
