import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import {
  CreateContactBlockDto,
  CreateTeamContactDto,
  DeclineTeamContactDto,
  UpdateContactPolicyDto,
} from './dto/team-contact.dto';
import { TeamContactsService } from './team-contacts.service';

@Controller()
export class TeamContactsController {
  constructor(private readonly teamContactsService: TeamContactsService) {}

  @Post('teams/:teamId/contacts')
  @UseGuards(V1AuthGuard)
  create(
    @CurrentUser() user: V1AuthUser,
    @Param('teamId') teamId: string,
    @Body() dto: CreateTeamContactDto,
  ) {
    return this.teamContactsService.create(user, teamId, dto);
  }

  @Get('me/team-contacts/summary')
  @UseGuards(V1AuthGuard)
  summary(@CurrentUser() user: V1AuthUser) {
    return this.teamContactsService.summary(user);
  }

  @Patch('team-contacts/:contactId/accept')
  @UseGuards(V1AuthGuard)
  accept(@CurrentUser() user: V1AuthUser, @Param('contactId') contactId: string) {
    return this.teamContactsService.accept(user, contactId);
  }

  @Patch('team-contacts/:contactId/decline')
  @UseGuards(V1AuthGuard)
  decline(
    @CurrentUser() user: V1AuthUser,
    @Param('contactId') contactId: string,
    @Body() dto: DeclineTeamContactDto,
  ) {
    return this.teamContactsService.decline(user, contactId, dto);
  }

  @Post('team-contacts/:contactId/withdraw')
  @UseGuards(V1AuthGuard)
  withdraw(@CurrentUser() user: V1AuthUser, @Param('contactId') contactId: string) {
    return this.teamContactsService.withdraw(user, contactId);
  }

  @Post('teams/:teamId/contact-blocks')
  @UseGuards(V1AuthGuard)
  createBlock(
    @CurrentUser() user: V1AuthUser,
    @Param('teamId') teamId: string,
    @Body() dto: CreateContactBlockDto,
  ) {
    return this.teamContactsService.createBlock(user, teamId, dto);
  }

  @Get('teams/:teamId/contact-blocks')
  @UseGuards(V1AuthGuard)
  listBlocks(@CurrentUser() user: V1AuthUser, @Param('teamId') teamId: string) {
    return this.teamContactsService.listBlocks(user, teamId);
  }

  @Delete('teams/:teamId/contact-blocks/:blockedTeamId')
  @UseGuards(V1AuthGuard)
  removeBlock(
    @CurrentUser() user: V1AuthUser,
    @Param('teamId') teamId: string,
    @Param('blockedTeamId') blockedTeamId: string,
  ) {
    return this.teamContactsService.removeBlock(user, teamId, blockedTeamId);
  }

  @Patch('teams/:teamId/contact-policy')
  @UseGuards(V1AuthGuard)
  updateContactPolicy(
    @CurrentUser() user: V1AuthUser,
    @Param('teamId') teamId: string,
    @Body() dto: UpdateContactPolicyDto,
  ) {
    return this.teamContactsService.updateContactPolicy(user, teamId, dto);
  }
}
