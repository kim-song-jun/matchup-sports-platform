import { BadRequestException, Body, Controller, Param, ParseUUIDPipe, Patch, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { UpdateLeagueEntryFeeDto } from './dto/league-entry-fee.dto';
import { LeagueEntryFeeService } from './league-entry-fee.service';

// 다른 리그 컨트롤러와 같은 도메인 코드(LEAGUE_ID_INVALID)로 맞춘다.
const leagueIdPipe = new ParseUUIDPipe({
  exceptionFactory: () =>
    new BadRequestException({ code: 'LEAGUE_ID_INVALID', message: '올바르지 않은 리그 ID예요.' }),
});

@Controller('admin/league-matches')
@UseGuards(V1AuthGuard)
export class LeagueEntryFeeController {
  constructor(private readonly service: LeagueEntryFeeService) {}

  @Patch(':leagueId/entry-fee')
  update(
    @CurrentUser() user: V1AuthUser,
    @Param('leagueId', leagueIdPipe) leagueId: string,
    @Body() dto: UpdateLeagueEntryFeeDto,
  ) {
    return this.service.update(user, leagueId, dto);
  }
}
