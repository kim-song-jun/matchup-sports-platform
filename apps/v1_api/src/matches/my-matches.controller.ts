import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import { MyMatchesQueryDto } from './dto/matches-query.dto';
import { MatchesService } from './matches.service';

@Controller('me')
export class MyMatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @Get('matches')
  @UseGuards(V1AuthGuard)
  matches(@CurrentUser() user: V1AuthUser, @Query() query: MyMatchesQueryDto) {
    return this.matchesService.myMatches(user, query);
  }
}
