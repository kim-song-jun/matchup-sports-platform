import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { CurrentUser } from '../../auth/current-user.decorator';
import { V1AuthGuard } from '../../auth/v1-auth.guard';
import type { V1AuthUser } from '../../auth/v1-auth-user';
import { SixTeamService } from './six-team.service';
export class SixTeamDecisionDto {
  @IsString() @MaxLength(64) version!: string;
  @IsString() @MaxLength(500) reason!: string;
  @IsOptional() @IsBoolean() swapSemi?: boolean;
  @IsOptional() @IsBoolean() swapFinal?: boolean;
  @IsBoolean() manual!: boolean;
  @IsOptional() @IsString() @MaxLength(80) bye?: string;
  @IsObject() winners!: Record<string, string>;
}
@Controller('admin/tournaments/:tournamentId/bracket/six-team')
@UseGuards(V1AuthGuard)
export class SixTeamController {
  constructor(private readonly service: SixTeamService) {}
  @Get() preview(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId') id: string
  ) {
    return this.service.preview(user, id);
  }
  @Put() decide(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId') id: string,
    @Body() dto: SixTeamDecisionDto
  ) {
    return this.service.decide(user, id, dto);
  }
}
