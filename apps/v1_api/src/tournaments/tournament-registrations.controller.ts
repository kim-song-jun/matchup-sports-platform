import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import {
  CancelRegistrationRequestDto,
  CreateRegistrationDto,
  SubmitRegistrationDto,
} from './dto/tournament-registration.dto';
import { TournamentRegistrationsService } from './tournament-registrations.service';

@Controller('tournaments/:tournamentId/registrations')
@UseGuards(V1AuthGuard)
export class TournamentRegistrationsController {
  constructor(private readonly registrationsService: TournamentRegistrationsService) {}

  @Post()
  create(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId') tournamentId: string,
    @Body() dto: CreateRegistrationDto,
  ) {
    return this.registrationsService.create(user, tournamentId, dto);
  }

  @Get('my-registration')
  getMyRegistration(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId') tournamentId: string,
  ) {
    return this.registrationsService.getMyRegistration(user, tournamentId);
  }

  @Get(':registrationId')
  get(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId') tournamentId: string,
    @Param('registrationId') registrationId: string,
  ) {
    return this.registrationsService.get(user, tournamentId, registrationId);
  }

  @Post(':registrationId/submit')
  submit(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId') tournamentId: string,
    @Param('registrationId') registrationId: string,
    @Body() dto: SubmitRegistrationDto,
  ) {
    return this.registrationsService.submit(user, tournamentId, registrationId, dto);
  }

  @Post(':registrationId/cancel-request')
  cancelRequest(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId') tournamentId: string,
    @Param('registrationId') registrationId: string,
    @Body() dto: CancelRegistrationRequestDto,
  ) {
    return this.registrationsService.cancelRequest(user, tournamentId, registrationId, dto);
  }
}
