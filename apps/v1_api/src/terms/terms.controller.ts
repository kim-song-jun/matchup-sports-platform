import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { OptionalV1AuthGuard } from '../auth/optional-v1-auth.guard';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import {
  AcceptManagedTermsDto,
  CurrentManagedTermsQueryDto,
} from './dto/managed-terms-runtime.dto';
import { ManagedTermsRuntimeService } from './managed-terms-runtime.service';

@Controller('terms')
export class TermsController {
  constructor(private readonly managedTerms: ManagedTermsRuntimeService) {}

  @Get('current')
  @UseGuards(OptionalV1AuthGuard)
  current(
    @CurrentUser() user: V1AuthUser | undefined,
    @Query() query: CurrentManagedTermsQueryDto,
  ) {
    return this.managedTerms.currentTerms(query.context, user?.id);
  }

  @Post('consents')
  @UseGuards(V1AuthGuard)
  accept(@CurrentUser() user: V1AuthUser, @Body() dto: AcceptManagedTermsDto) {
    return this.managedTerms.acceptSignupTerms(user.id, dto.documentIds);
  }
}
