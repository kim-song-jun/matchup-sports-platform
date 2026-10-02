import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../auth/current-user.decorator';
import { V1AuthGuard } from '../../auth/v1-auth.guard';
import { V1AuthUser } from '../../auth/v1-auth-user';
import { CreateMockTournamentDto } from './mock-tournament-seed.dto';
import { MockTournamentSeedService } from './mock-tournament-seed.service';

@Controller('admin/mock-seed')
@UseGuards(V1AuthGuard)
export class MockTournamentSeedController {
  constructor(private readonly service: MockTournamentSeedService) {}

  /** 화면이 버튼을 보여줄지 판단하는 용도 — 꺼진 환경에서는 UI 자체를 숨긴다. */
  @Get('availability')
  availability() {
    return this.service.availability();
  }

  @Post('tournaments')
  createTournament(@CurrentUser() user: V1AuthUser, @Body() dto: CreateMockTournamentDto) {
    return this.service.createTournament(user, dto);
  }
}
